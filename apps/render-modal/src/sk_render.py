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
    3. replace/mix audio (voiceover + BGM, volume masing-masing)
    4. resize ke orientation + resolution target
    5. transcribe via faster-whisper → SRT (bila caption enabled)
    6. burn subtitle (bila caption enabled):
       - wordHighlight → ASS karaoke per-kata (kata aktif menyala)
       - tanpa highlight → SRT + force_style
    7. headline overlay (bila diisi) — drawtext, posisi Y normalisasi
    8. upload output + SRT balik ke R2 (presigned PUT)

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
    # huggingface-hub WAJIB <1: faster-whisper 1.1.1 deklarasi ">=0.13" tanpa
    # upper bound, tapi hub 1.x drop `requests` dari base deps (ganti httpx)
    # padahal faster-whisper masih `import requests` → ModuleNotFoundError
    # saat caption pertama di-render. Pin ke range yang asli di-test.
    .pip_install(
        "faster-whisper==1.1.1",
        "huggingface-hub>=0.13,<1",
        "requests>=2.31.0",
        "fastapi[standard]",
    )
    # Smoke test import saat build — dua bug terakhir (curl hilang, requests
    # hilang) hanya muncul saat render pertama jalan. Import di sini bikin
    # dependency missing → deploy gagal, bukan job pertama gagal.
    .run_commands(
        'python -c "import faster_whisper, requests; '
        "import huggingface_hub as h; "
        "assert int(h.__version__.split('.')[0]) < 1, h.__version__; "
        "print('deps ok')\""
    )
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
    """Download presigned URL ke file lokal (stream, hemat memori)."""
    import shutil
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SahabatKreator-Render/1.0"})
        with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    except urllib.error.URLError as exc:
        raise RuntimeError(f"download gagal {url[:80]}: {exc}")


def _upload(local: str, presigned_url: str, content_type: str) -> None:
    """PUT file ke R2 via presigned URL.

    Content-Type WAJIB sama dengan saat presign dibuat — masuk signature
    SigV4, salah → 403 SignatureDoesNotMatch.
    """
    import urllib.error
    import urllib.request

    # Bytes eksplisit (bukan file object) — urllib baru set Content-Length untuk
    # data bytes-like; tanpa itu S3 presigned PUT gagal (chunked butuh signing
    # STREAMING-AWS4-HMAC-SHA256-PAYLOAD yang urllib tidak produksi).
    data = Path(local).read_bytes()
    req = urllib.request.Request(
        presigned_url, data=data, method="PUT", headers={"Content-Type": content_type}
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            r.read()
    except urllib.error.HTTPError as exc:
        body = exc.read()[:300]
        raise RuntimeError(f"upload gagal HTTP {exc.code}: {body}")


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
        # word_timestamps True hanya kalau karaoke dipakai — hemat CPU & memori
        segments, info = model.transcribe(
            voice, language=lang, beam_size=5, vad_filter=True,
            word_timestamps=bool(cap.get("wordHighlight")),
        )
        detected_lang = getattr(info, "language", None)

        # SRT selalu dibuat (di-upload untuk transcript terbuka), tapi burn
        # memakai ASS saat wordHighlight agar ada highlight per-kata.
        srt_path = f"{tmpdir}/caption.srt"
        Path(srt_path).write_text(_segments_to_srt(segments), encoding="utf-8")

        if req.get("srtUploadUrl"):
            _upload(srt_path, req["srtUploadUrl"], "application/x-subrip")

        burned = f"{tmpdir}/burned.mp4"
        if cap.get("wordHighlight"):
            ass_path = f"{tmpdir}/caption.ass"
            Path(ass_path).write_text(
                _segments_to_ass(segments, cap, target), encoding="utf-8"
            )
            # ASS bawa style sendiri — jangan pakai force_style
            _ffmpeg([
                "-i", current, "-vf", f"subtitles={ass_path}",
                "-c:v", "libx264", "-preset", "medium", "-crf", "23",
                "-c:a", "copy", burned,
            ])
        else:
            # posisi vertikal subtitle (force_style butuh Alignment numpad ASS)
            pos_y = {"bottom": 0.85, "top": 0.15, "center": 0.5}.get(
                cap.get("position", "bottom"), 0.85
            )
            align = _ASS_ALIGN.get(cap.get("position", "bottom"), 2)
            if align == 5:
                margin = 0
            elif align == 8:
                margin = int(pos_y * target[1])
            else:
                margin = int((1 - pos_y) * target[1])
            # force_style berisi koma — WAJIB dibungkus quote tunggal. Tanpa itu
            # filtergraph parser belah koma sebagai pemisah filter → "No such
            # filter: 'PrimaryColour'" (nilai ASS style jadi filter sendiri).
            # Quote di dalam graphparser melindungi koma & karakter khusus.
            style = (
                f"FontSize={cap.get('fontSize', 24)},"
                f"PrimaryColour={_ass_color(cap.get('fontColor', 'white'))},"
                f"Alignment={align},MarginV={margin}"
            )
            _ffmpeg([
                "-i", current, "-vf",
                f"subtitles={srt_path}:force_style='{style}'",
                "-c:v", "libx264", "-preset", "medium", "-crf", "23",
                "-c:a", "copy", burned,
            ])
        current = burned

    # --- headline stage ---
    # Headline overlay: teks besar di atas video (hook). drawtext butuh font
    # file absolute; fontfile path tidak boleh berisi karakter filtergraph.
    headline = settings.get("headline")
    if headline and (headline.get("text") or "").strip():
        hl_text = f"{tmpdir}/headline.txt"
        Path(hl_text).write_text(headline["text"], encoding="utf-8")
        # font DejaVu dari paket fonts-dejavu-core (sudah di apt_install)
        font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        hl_size = headline.get("fontSize", 48)
        hl_color = _DRAWTEXT_COLORS.get(headline.get("fontColor", "white"), "white")
        pos_y = float(headline.get("positionY", 0.1))
        hl_out = f"{tmpdir}/headline.mp4"
        # textfile & fontfile path di-quote tunggal; isinya tanpa karakter
        # filtergraph (tmpdir /usr/share/fonts, bukan path Windows).
        # line_spacing hanya berlaku multiline; box semi-transparan untuk
        # kontras teks terhadap video.
        _ffmpeg([
            "-i", current, "-vf",
            f"drawtext=textfile='{hl_text}':fontfile='{font}'"
            f":fontsize={hl_size}:fontcolor={hl_color}"
            f":x=(w-text_w)/2:y=h*{pos_y}"
            ":box=1:boxcolor=black@0.5:boxborderw=12:line_spacing=8",
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-c:a", "copy", hl_out,
        ])
        current = hl_out

    # --- upload output ---
    _upload(current, req["outputUploadUrl"], "video/mp4")

    # Thumbnail: frame pertama output (JPEG). Media library memakai ini sebagai
    # poster kartu; tanpa ini, frontend render <video preload="metadata"> per
    # kartu → berat dan tidak konsisten antar browser.
    if req.get("thumbnailUploadUrl"):
        thumb = f"{tmpdir}/thumb.jpg"
        _ffmpeg([
            "-ss", "0", "-i", current, "-frames:v", "1", "-q:v", "3",
            "-vf", f"scale={target[0]}:{target[1]}:force_original_aspect_ratio=decrease,"
                   f"pad={target[0]}:{target[1]}:(ow-iw)/2:(oh-ih)/2:color=black",
            thumb,
        ])
        _upload(thumb, req["thumbnailUploadUrl"], "image/jpeg")

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
# Warna highlight kata aktif (karaoke). Kuning kontras di mayoritas video.
_ASS_HIGHLIGHT = "&H0000FFFF"

# Alignment numpad ASS: 2 bawah-tengah, 5 tengah, 8 atas-tengah
_ASS_ALIGN = {"bottom": 2, "center": 5, "top": 8}


def _ass_color(name: str) -> str:
    return _ASS_COLORS.get(name, "&H00FFFFFF")


# Warna untuk drawtext (headline) — nama warna ffmpeg, bukan ASS hex
_DRAWTEXT_COLORS = {
    "white": "white", "black": "black", "yellow": "yellow",
    "red": "red", "green": "green", "blue": "blue",
}


def _fmt_ass(seconds: float) -> str:
    """Timestamp ASS: H:MM:SS.cc (centiseconds)."""
    if seconds < 0:
        seconds = 0.0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round(seconds % 1 * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _esc_ass(text: str) -> str:
    """Escape karakter khusus ASS: {} mulai override block, \\ tag."""
    return text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", " ")


def _segments_to_ass(segments, cap: dict, target: tuple[int, int]) -> str:
    """ASS karaoke per-kata (\\k) — kata aktif menyala saat diucapkan.

    Catatan semantik (diverifikasi terhadap ffmpeg+libass): kata AKTIF dan
    yang sudah lewat dirender dengan PrimaryColour; kata yang belum dicapai
    dengan SecondaryColour. Karena itu Primary = warna highlight, Secondary
    = warna base — kebalik dari intuisi. Efek visual: tiap kata menyala
    saat diucapkan dan tetap menyala (klasik karaoke).

    word_timestamps wajib True saat transcribe (dilakukan caller saat
    wordHighlight aktif).
    """
    font_size = cap.get("fontSize", 24)
    align = _ASS_ALIGN.get(cap.get("position", "bottom"), 2)
    # MarginV: jarak dari tepi bawah/atas. Alignment=5 (tengah) simetris —
    # MarginV besar akan tekan text ke tinggi nol, jadi pakai 0 (center murni).
    pos_y = {"bottom": 0.85, "top": 0.15, "center": 0.5}.get(cap.get("position", "bottom"), 0.85)
    if align == 5:
        margin_v = 0
    elif align == 8:  # atas: jarak dari tepi atas
        margin_v = int(pos_y * target[1])
    else:  # bawah: jarak dari tepi bawah
        margin_v = int((1 - pos_y) * target[1])

    base = _ass_color(cap.get("fontColor", "white"))
    # Primary = highlight (kata aktif), Secondary = base (belum tercapai)
    highlight = _ASS_HIGHLIGHT

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {target[0]}",
        f"PlayResY: {target[1]}",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,DejaVu Sans,{font_size},{highlight},{base},"
        "&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,"
        f"{align},40,40,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text",
    ]
    for seg in segments:
        words = [w for w in (getattr(seg, "words", None) or []) if (w.word or "").strip()]
        if not words:
            # Fallback: teks segment utuh sebagai satu suku
            text = _esc_ass((seg.text or "").strip())
            if text:
                dur = max(1, int((seg.end - seg.start) * 100))
                lines.append(
                    f"Dialogue: 0,{_fmt_ass(seg.start)},{_fmt_ass(seg.end)},"
                    f"Default,,0,0,0,{{\\k{dur}}}{text}"
                )
            continue
        parts = []
        for w in words:
            dur = max(1, int(round((w.end - w.start) * 100)))
            parts.append(f"{{\\k{dur}}}{_esc_ass(w.word.strip())}")
        lines.append(
            f"Dialogue: 0,{_fmt_ass(seg.start)},{_fmt_ass(seg.end)},"
            f"Default,,0,0,0,{''.join(parts)}"
        )
    return "\n".join(lines) + "\n"


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
