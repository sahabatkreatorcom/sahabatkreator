"""
Modal function — render video SahabatKreator.

Deploy terpisah dari monorepo TS (Modal butuh akun & CLI sendiri):

    # sekali: buat secret yang simpan token bersama server SahabatKreator
    modal secret create sk-render-auth MODAL_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(32))")

    cd apps/render-modal
    modal deploy src/sk_render.py          # output: URL function → MODAL_RENDER_URL

Endpoint (FastAPI, auth Bearer MODAL_TOKEN):
    GET  /health  — smoke test
    POST /render  — jalankan pipeline, sync sampai selesai

Pipeline (port dari MassVEPro src/core/, dibersihkan):
    1. fetch input dari R2 (presigned URL)
    2. probe durasi voiceover (master — tidak pernah dimodifikasi)
    3. replace/mix audio (voiceover + BGM)
    4. resize ke orientation + resolution target
    5. transcribe via faster-whisper → SRT (bila caption enabled)
    6. burn subtitle (bila caption enabled)
    7. upload output + SRT balik ke R2 (presigned PUT)

FASE 1 = SYNC: satu render per request, selesai dalam satu koneksi.
Karena render cpu=1, concurrency per container dibatasi 1 (Modal scale-out
bikin container baru per request concurrent). Async (submit + poll /status)
adalah fase 2 — lihat docs/rfc-video-render.md.

Yang SENGAJA TIDAK ada (RFC §2 — evasion, ToS violation):
    - metadata device/GPS palsu (metadata_spoofer.py)
    - visual randomization sub-persepsi (anti_detection.py)
    - SEI removal / fingerprint stripping

Resource: CPU $0.0000131/core/s + RAM $0.00000222/GiB/s (Modal 2026).
Render 5 menit @ 1 core/2GiB ≈ $0.005; free tier Starter $30/bln ≈ ±5.700 render.
"""
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import modal

# ---------------------------------------------------------------- image
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-dejavu-core")
    .pip_install("faster-whisper==1.1.1", "fastapi[standard]")
)

app = modal.App("sahabatkreator-render", image=image)

# Token Bearer yang sama dengan MODAL_TOKEN di env server SahabatKreator.
# Dibuat sekali: `modal secret create sk-render-auth MODAL_TOKEN=<random>`.
_RENDER_SECRET = modal.Secret.from_name("sk-render-auth")

# Model whisper lazy-load per container (Modal reuse container → gratis sekali).
# Disimpan global per container, bukan per request.
_WHISPER_CACHE: dict = {}


def _ffmpeg(args: list, timeout: int = 900) -> None:
    """Jalankan ffmpeg, raise dengan stderr bila gagal."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg exit {proc.returncode}: {proc.stderr.decode()[-400:]}")


def _probe_duration(path: str) -> float:
    """Probe durasi via ffprobe (detik)."""
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe gagal: {proc.stderr.decode()[-300:]}")
    return float(proc.stdout.decode().strip())


def _probe_dimensions(path: str) -> tuple[int, int]:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height",
         "-of", "csv=s=x:p=0", path],
        capture_output=True, timeout=120,
    )
    w, h = proc.stdout.decode().strip().split("x")
    return int(w), int(h)


def _download(url: str, dest: str) -> None:
    """Download presigned URL ke file lokal."""
    proc = subprocess.run(
        ["curl", "-sfL", "-o", dest, url],
        capture_output=True, timeout=600,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"download gagal {url[:80]}: {proc.stderr.decode()[-200:]}")


def _upload(local: str, presigned_url: str) -> None:
    """PUT file ke R2 via presigned URL."""
    with open(local, "rb") as f:
        proc = subprocess.run(
            ["curl", "-sfL", "-X", "PUT", "--data-binary", "@-", presigned_url],
            stdin=f, capture_output=True, timeout=900,
        )
    if proc.returncode != 0:
        raise RuntimeError(f"upload gagal: {proc.stderr.decode()[-200:]}")


_RESOLUTIONS = {"720p": (1280, 720), "1080p": (1920, 1080)}
_ORIENTATION = {
    "portrait": (1080, 1920),   # 9:16 — TikTok/Reels/Shorts
    "landscape": (1920, 1080),  # 16:9 — YouTube
    "square": (1080, 1080),     # 1:1 — IG feed
}


def _whisper(model_size: str):
    """Lazy-load model whisper (cache per container)."""
    if model_size not in _WHISPER_CACHE:
        from faster_whisper import WhisperModel
        _WHISPER_CACHE[model_size] = WhisperModel(
            model_size, device="cpu", compute_type="int8"
        )
    return _WHISPER_CACHE[model_size]


def _segments_to_srt(segments) -> str:
    lines = []
    n = 0
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        n += 1
        lines.append(str(n))
        lines.append(f"{_fmt(seg.start)} --> {_fmt(seg.end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def _fmt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(seconds % 1 * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _run_pipeline(req: dict, tmpdir: str) -> dict:
    """Pipeline render inti. Throw bila gagal (dipetakan caller ke retryable)."""
    settings = req["settings"]
    base_video = f"{tmpdir}/base.mp4"
    _download(req["baseVideoUrl"], base_video)

    # Voiceover adalah master — durasinya menentukan output.
    voice = None
    if req.get("voiceoverUrl"):
        voice = f"{tmpdir}/voice.mp3"
        _download(req["voiceoverUrl"], voice)

    bgm = None
    if req.get("bgmUrl"):
        bgm = f"{tmpdir}/bgm.mp3"
        _download(req["bgmUrl"], bgm)

    # --- audio stage: replace / mix ---
    audio_stage = f"{tmpdir}/audio.mp4"
    if voice:
        voice_dur = _probe_duration(voice)
        video_dur = _probe_duration(base_video)

        # Kalau video lebih panjang dari voiceover → ambil segmen sepanjang voiceover
        # (smart segmentation dari MassVEPro, dipertahankan).
        if video_dur > voice_dur + 1.0:
            seg = f"{tmpdir}/seg.mp4"
            _ffmpeg(["-ss", "0", "-i", base_video, "-t", str(voice_dur + 0.5),
                     "-c", "copy", "-an", seg])
            base_video = seg

        if bgm:
            # Mix voiceover + BGM (voice 1.0, bgm 0.3 default)
            _ffmpeg([
                "-i", base_video, "-i", voice, "-i", bgm,
                "-filter_complex",
                f"[1:a]volume={settings['voiceVolume']}[v];"
                f"[2:a]volume={settings['bgmVolume']},aloop=loop=-1:size=2e9[b];"
                f"[v][b]amix=inputs=2:duration=first[a]",
                "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", audio_stage,
            ])
        else:
            _ffmpeg([
                "-i", base_video, "-i", voice,
                "-filter_complex", f"[1:a]volume={settings['voiceVolume']}[a]",
                "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", audio_stage,
            ])
    else:
        # Tanpa voiceover: pakai audio asli (atau -an kalau remove_original_audio)
        if settings.get("removeOriginalAudio"):
            _ffmpeg(["-i", base_video, "-c", "copy", "-an", audio_stage])
        else:
            audio_stage = base_video

    # --- resize stage ---
    res = _RESOLUTIONS.get(settings["resolution"], (1920, 1080))
    target = _ORIENTATION.get(settings["orientation"], (1080, 1920))
    # scale pakai force_original_aspect_ratio=decrease + pad ke target rasio
    vf = (
        f"scale={target[0]}:{target[1]}:force_original_aspect_ratio=decrease,"
        f"pad={target[0]}:{target[1]}:(ow-iw)/2:(oh-ih)/2:color=black"
    )
    resized = f"{tmpdir}/resized.mp4"
    _ffmpeg([
        "-i", audio_stage,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "23",
        "-c:a", "aac", resized,
    ])

    current = resized

    # --- caption stage ---
    cap = settings.get("caption", {})
    srt_path: Optional[str] = None
    detected_lang: Optional[str] = None
    if cap.get("enabled") and voice:
        model = _whisper(cap.get("model", "base"))
        lang = None if cap.get("language") == "auto" else cap.get("language", "id")
        segments, info = model.transcribe(
            voice, language=lang, beam_size=5, vad_filter=True,
            word_timestamps=bool(cap.get("wordHighlight")),
        )
        detected_lang = getattr(info, "language", None)
        srt_path = f"{tmpdir}/caption.srt"
        Path(srt_path).write_text(_segments_to_srt(segments), encoding="utf-8")

        if req.get("srtUploadUrl"):
            _upload(srt_path, req["srtUploadUrl"])

        burned = f"{tmpdir}/burned.mp4"
        # posisi vertikal subtitle
        pos_map = {"bottom": "0.85", "top": "0.15", "center": "0.5"}
        y = pos_map.get(cap.get("position", "bottom"), "0.85")
        _ffmpeg([
            "-i", current, "-vf",
            f"subtitles={srt_path}:force_style="
            f"FontSize={cap.get('fontSize', 24)},"
            f"PrimaryColour={_ass_color(cap.get('fontColor', 'white'))},"
            f"Alignment=2,MarginV={(1 - float(y)) * target[1]:.0f}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-c:a", "copy", burned,
        ])
        current = burned

    # --- upload output ---
    _upload(current, req["outputUploadUrl"])

    w, h = _probe_dimensions(current)
    return {
        "durationSeconds": round(_probe_duration(current), 2),
        "width": w,
        "height": h,
        "sizeBytes": Path(current).stat().st_size,
        "detectedLanguage": detected_lang,
    }


_ASS_COLORS = {
    "white": "&H00FFFFFF", "black": "&H00000000", "yellow": "&H0000FFFF",
    "red": "&H000000FF", "green": "&H0000FF00", "blue": "&H00FF0000",
}


def _ass_color(name: str) -> str:
    return _ASS_COLORS.get(name, "&H00FFFFFF")


def _retryable(exc: Exception) -> bool:
    """Heuristik: error input = permanen, sisanya retryable."""
    msg = str(exc).lower()
    permanent = ("invalid", "not found", "no video", "codec", "unsupported", "gagal download")
    return not any(k in msg for k in permanent)


def _render_sync(req: dict) -> dict:
    """Satu render sync: jalankan pipeline, hapus tmpdir, kembalikan hasil."""
    req_id = req.get("jobId") or str(uuid.uuid4())
    tmpdir = tempfile.mkdtemp(prefix=f"sk_{req_id}_")
    try:
        result = _run_pipeline(req, tmpdir)
        return {"status": "done", **result}
    except Exception as exc:
        return {
            "status": "failed",
            "code": "pipeline_error",
            "message": str(exc)[:400],
            "retryable": _retryable(exc),
        }
    finally:
        subprocess.run(["rm", "-rf", tmpdir], capture_output=True)


# ---------------------------------------------------------------- endpoint
@app.function(
    image=image,
    cpu=1,
    memory=2048,
    secrets=[_RENDER_SECRET],
)
# Satu render per container — render cpu-bound; request concurrent dapat
# container baru (scale-out Modal), bukan thread di container yang sama.
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def web():
    import os

    from fastapi import Depends, FastAPI, HTTPException
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    from starlette.concurrency import run_in_threadpool

    api = FastAPI(title="SahabatKreator render")
    auth = HTTPBearer()

    def verify(creds: HTTPAuthorizationCredentials = Depends(auth)) -> None:
        if creds.credentials != os.environ["MODAL_TOKEN"]:
            raise HTTPException(status_code=401, detail="unauthorized")

    @api.get("/health")
    async def health(_: None = Depends(verify)) -> dict:
        return {"status": "ok"}

    @api.post("/render")
    async def render(item: dict, _: None = Depends(verify)) -> dict:
        # Pipeline blocking (ffmpeg/whisper) di threadpool agar event loop
        # tetap sehat; container hanya pegang 1 request (max_inputs=1).
        return await run_in_threadpool(_render_sync, item)

    return api
