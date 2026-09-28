"""
Modal function — SahabatKreator auto-clip INGEST (akun Modal kedua).

Deploy terpisah dari sk_render.py — lihat README apps/render-modal. App ini
sengaja di akun Modal KEDUA (RFC docs/rfc-auto-clip.md §4): quota concurrency
Starter 100 container per workspace, jadi transkripsi clipper tidak
kelaparkan job render slideshow yang customer publish tunggu.

    # sekali: profil kedua akun (token pair dari Settings → API Tokens).
    # JANGAN `modal token new` untuk berganti akun — menimpa profil aktif
    # (docs/deployment.md §10.3).
    modal token set --profile clipper --token-id <ak-> --token-secret <as->

    # sekali: secret token clipper (BEDA dari secret render akun pertama)
    MODAL_PROFILE=clipper modal secret create sk-render-auth \
        MODAL_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(32))")

    cd apps/render-modal
    MODAL_PROFILE=clipper modal deploy src/sk_clipper.py   # URL → MODAL_CLIPPER_URL

Endpoint (FastAPI, auth Bearer MODAL_TOKEN — nilai = MODAL_CLIPPER_TOKEN server):
    GET  /health  — smoke test
    POST /ingest  — download source + transkrip whisper + upload SRT ke R2

Yang dilakukan /ingest (RFC §6 langkah 1-2):
    1. HEAD validate source URL (Content-Type video, ukuran wajar)
    2. download source (T1/T2 paste-link atau presigned R2) ke tmp
    3. ffprobe durasi + dimensi + ada-tidaknya audio
    4. transkrip faster-whisper (word_timestamps bila diminta worker)
    5. segments → SRT → upload ke R2 (presigned PUT dari worker)
    6. return metadata source (worker simpan untuk validasi rentang AI)

Yang TIDAK dilakukan di sini: seleksi momen (OpenRouter, di worker TS — itu
orkestrasi DB + cache Redis). Split-screen/camera-switch = fase 2.

T3 (platform scraping / yt-dlp) TIDAK ADA di file ini — ditahan total (RFC §2).
Jangan tambah downloader platform: cookies Google user di server = risiko
penanganan kredensial kelas tertinggi + ToS, tidak sepadan.

Resource (RFC §7): CPU $0.0000131/core/s + RAM $0.00000222/GiB/s.
Ingest 30 menit @ 4 core ≈ $0,037. Starter $30/bln ≈ ±810 job.
Log retention Starter 1 hari → message error wajib self-contained.
"""
import subprocess
import tempfile
from pathlib import Path

import modal

# ---------------------------------------------------------------- image
# Image sama pola dengan sk_render.py: pin transitive + import check saat build
# (3 bug terakhir baru muncul saat request pertama — lihat catatan sk_render).
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "fonts-dejavu-core")
    # huggingface-hub WAJIB <1: faster-whisper 1.1.1 deklarasi ">=0.13" tanpa
    # upper bound, tapi hub 1.x drop `requests` dari base deps (ganti httpx)
    # padahal faster-whisper masih `import requests` → ModuleNotFoundError.
    .pip_install(
        "faster-whisper==1.1.1",
        "huggingface-hub>=0.13,<1",
        "requests>=2.31.0",
        "fastapi[standard]",
    )
    .run_commands(
        'python -c "import faster_whisper, requests; '
        "import huggingface_hub as h; "
        "assert int(h.__version__.split('.')[0]) < 1, h.__version__; "
        "print('deps ok')\""
    )
)

app = modal.App("sahabatkreator-clipper", image=image)

# Token Bearer — nilai sama dengan MODAL_CLIPPER_TOKEN (fallback MODAL_TOKEN)
# di env server. Secret name SAMA dgn sk_render.py (sk-render-auth) supaya bisa
# dipakai dua app di dua akun; nilainya dibuat beda saat deploy ke akun kedua.
_RENDER_SECRET = modal.Secret.from_name("sk-render-auth")

_WHISPER_CACHE: dict = {}

# Batas aman source: long-form 2 jam @1080p ≈ 1-2 GB. Lebih dari ini tolak
# (bukan hanya mahal — bisa OOM container 4 GiB saat decode).
_MAX_SOURCE_BYTES = 4 * 1024 * 1024 * 1024
# Durasi source maksimal (detik). 3 jam; lebih dari itu user harus potong dulu.
_MAX_SOURCE_SECONDS = 3 * 3600


def _ffmpeg(args: list, timeout: int = 900) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg exit {proc.returncode}: {proc.stderr.decode()[-400:]}")


def _probe(path: str) -> dict:
    """Probe durasi, dimensi, ada audio, ukuran file."""
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,size:stream=codec_type,width,height",
         "-of", "json", path],
        capture_output=True, timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe gagal: {proc.stderr.decode()[-300:]}")
    import json

    data = json.loads(proc.stdout)
    fmt = data.get("format", {})
    streams = data.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in streams)
    return {
        "duration": float(fmt.get("duration", 0) or 0),
        "sizeBytes": int(fmt.get("size", 0) or 0),
        "width": int(video_stream.get("width", 0) or 0),
        "height": int(video_stream.get("height", 0) or 0),
        "hasAudio": has_audio,
    }


def _head_source(url: str) -> tuple[int, str]:
    """HEAD check sebelum download: dapat ukuran + content type.

    Argumen kunci untuk URL paste-link T1/T2 (tidak terkontrol): tolak dini
    kalau bukan video atau kebesaran, sebelum habiskan bandwidth container.
    Presigned R2 biasanya dukung HEAD; kalau tidak (405/403), lewati ukuran
    dan andalkan probe lokal.
    """
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "SahabatKreator-Clipper/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            size = int(r.headers.get("Content-Length") or 0)
            ctype = (r.headers.get("Content-Type") or "").lower()
            return size, ctype
    except (urllib.error.HTTPError, urllib.error.URLError):
        # Banyak presigned S3/R2 menolak HEAD (signature method match but
        # some reject). Aman: skip validasi awal, andalkan probe lokal.
        return 0, ""


def _download(url: str, dest: str) -> None:
    import shutil
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SahabatKreator-Clipper/1.0"})
        with urllib.request.urlopen(req, timeout=900) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    except urllib.error.URLError as exc:
        raise RuntimeError(f"download gagal {url[:80]}: {exc}")


def _upload(local: str, presigned_url: str, content_type: str) -> None:
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
        raise RuntimeError(f"upload SRT gagal HTTP {exc.code}: {body}")


def _whisper(model_size: str):
    """Lazy-load model whisper (cache per container — Modal reuse = gratis)."""
    if model_size not in _WHISPER_CACHE:
        from faster_whisper import WhisperModel

        _WHISPER_CACHE[model_size] = WhisperModel(
            model_size, device="cpu", compute_type="int8"
        )
    return _WHISPER_CACHE[model_size]


def _fmt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(seconds % 1 * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _segments_to_srt(segments) -> tuple[str, int]:
    """Segments whisper → SRT. Return (srt, count)."""
    lines = []
    n = 0
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        # Rekonstruksi dari words bila seg.text tidak punya spasi
        # (terjadi saat word_timestamps=True di beberapa model)
        if " " not in text:
            words = getattr(seg, "words", None) or []
            word_list = [w.word.strip() for w in words if (w.word or "").strip()]
            if word_list:
                text = " ".join(word_list)
        n += 1
        lines.append(str(n))
        lines.append(f"{_fmt(seg.start)} --> {_fmt(seg.end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines), n


def _retryable(exc: Exception) -> bool:
    """Error sementara (network/timeout/5xx) → worker retry; lainnya gagal."""
    msg = str(exc).lower()
    if any(k in msg for k in ("timeout", "timed out", "temporarily", "502", "503", "504", "connection reset")):
        return True
    return False


def _ingest_sync(req: dict) -> dict:
    """Pipeline ingest sinkron: validate → download → probe → transkrip → SRT.

    Semua nilai dari req dibungkus defensif: worker TS yang kirim, tapi jangan
    percaya tipe — string kosong / None harus jadi default aman.
    """
    job_id = str(req.get("jobId") or "unknown")
    source_url = str(req.get("sourceUrl") or "").strip()
    srt_upload_url = str(req.get("srtUploadUrl") or "").strip()
    # Source upload (hanya input URL T1/T2): materialkan source ke R2 agar
    # render job anak bisa presign GET storageKey biasa. str(x or "") —
    # None/[] dari HTTP jadi string kosong = skip upload.
    source_upload_url = str(req.get("sourceUploadUrl") or "").strip()
    # str(x or default) — req dari HTTP bisa berisi tipe apa pun
    whisper_model = str(req.get("whisperModel") or "small").strip().lower()
    language = str(req.get("language") or "id").strip().lower()
    word_timestamps = bool(req.get("wordTimestamps"))
    source_tier = str(req.get("sourceTier") or "t1").strip().lower()
    if source_tier not in ("t1", "t2"):
        source_tier = "t1"

    if not source_url:
        return {"status": "failed", "code": "bad_request",
                "message": "sourceUrl wajib diisi", "retryable": False}
    if not srt_upload_url:
        return {"status": "failed", "code": "bad_request",
                "message": "srtUploadUrl wajib diisi (presigned R2)", "retryable": False}
    if whisper_model not in ("base", "small", "medium"):
        whisper_model = "small"
    if language not in ("id", "en", "auto"):
        language = "id"

    with tempfile.TemporaryDirectory(prefix=f"clipper_{job_id}_") as tmp:
        tmp_path = Path(tmp)

        # 1. HEAD validate (best-effort; presigned R2 sering tolak HEAD)
        head_size, head_ctype = _head_source(source_url)
        if head_size and head_size > _MAX_SOURCE_BYTES:
            return {"status": "failed", "code": "source_too_large",
                    "message": f"source {head_size} bytes > {_MAX_SOURCE_BYTES} (4 GiB). "
                               "Potong video panjang lebih dulu.",
                    "retryable": False}
        if head_ctype and not any(
            v in head_ctype for v in ("video", "octet-stream", "binary", "plain")
        ):
            return {"status": "failed", "code": "not_video",
                    "message": f"Content-Type source = {head_ctype}, bukan video.",
                    "retryable": False}

        # 2. Download source (T1/T2 paste-link atau presigned R2)
        source_path = tmp_path / f"source_{job_id}"
        try:
            _download(source_url, str(source_path))
        except Exception as exc:
            return {"status": "failed", "code": "download_failed",
                    "message": str(exc)[:400], "retryable": _retryable(exc)}

        if source_path.stat().st_size > _MAX_SOURCE_BYTES:
            return {"status": "failed", "code": "source_too_large",
                    "message": f"file hasil download {source_path.stat().st_size} bytes > 4 GiB.",
                    "retryable": False}

        # 3. Probe
        probe = _probe(str(source_path))
        duration = probe["duration"]
        if duration <= 0:
            return {"status": "failed", "code": "probe_failed",
                    "message": "ffprobe tidak dapat durasi (file korup / bukan video).",
                    "retryable": False}
        if duration > _MAX_SOURCE_SECONDS:
            return {"status": "failed", "code": "source_too_long",
                    "message": f"source {duration:.0f}s > {_MAX_SOURCE_SECONDS}s (3 jam). "
                               "Potong lebih dulu.",
                    "retryable": False}
        if not probe["hasAudio"]:
            return {"status": "failed", "code": "no_audio",
                    "message": "source tidak punya track audio — tidak ada yang bisa ditranskrip.",
                    "retryable": False}

        # 3.5. Materialkan source ke R2 (hanya input URL T1/T2). Dilakukan
        # SETELAH probe (source sudah terbukti valid) dan SEBELUM transkrip
        # (transkrip lama; upload gagal = gagal dini, jangan buang whisper).
        # Input media library tidak kirim sourceUploadUrl → skip (sudah di R2).
        if source_upload_url:
            try:
                _upload(str(source_path), source_upload_url, "video/mp4")
            except Exception as exc:
                return {"status": "failed", "code": "source_upload_failed",
                        "message": str(exc)[:400], "retryable": _retryable(exc)}

        # 4. Transkrip whisper. faster-whisper decode via ffmpeg internal,
        # jadi langsung pada file video (tidak perlu extract audio dulu).
        try:
            model = _whisper(whisper_model)
            # beam_size=1 di CPU: akurasi hampir sama, ~2x lebih cepat.
            # vad_filter buang jeda panjang (jangan transkrip keheningan).
            segments_gen, info = model.transcribe(
                str(source_path),
                language=None if language == "auto" else language,
                beam_size=1,
                vad_filter=True,
                word_timestamps=word_timestamps,
            )
            segments = list(segments_gen)
        except Exception as exc:
            return {"status": "failed", "code": "transcribe_failed",
                    "message": f"whisper {whisper_model} gagal: {str(exc)[:300]}",
                    "retryable": _retryable(exc)}

        if not segments:
            return {"status": "failed", "code": "empty_transcript",
                    "message": "transkrip kosong — mungkin tidak ada ucapan terdeteksi "
                               "(VAD terlalu agresif atau audio non-bicara).",
                    "retryable": False}

        # 5. SRT → upload R2
        srt_text, seg_count = _segments_to_srt(segments)
        srt_path = tmp_path / f"{job_id}.srt"
        srt_path.write_text(srt_text, encoding="utf-8")
        try:
            _upload(str(srt_path), srt_upload_url, "text/plain")
        except Exception as exc:
            return {"status": "failed", "code": "srt_upload_failed",
                    "message": str(exc)[:400], "retryable": _retryable(exc)}

        detected = getattr(info, "language", None)
        return {
            "status": "done",
            "durationSeconds": round(duration, 2),
            "width": probe["width"],
            "height": probe["height"],
            "sizeBytes": probe["sizeBytes"],
            "detectedLanguage": detected,
            "segmentCount": seg_count,
            "audioDurationSeconds": round(getattr(segments[-1], "end", duration), 2),
        }


@app.function(
    image=image,
    cpu=4,          # transkripsi parallel-friendly; 4 core ≈ $0,037 per 30mnt job
    memory=4096,    # decode 1080p buffer + whisper model + source partial
    timeout=60 * 30,  # 30 menit worst case (source 3 jam, model medium)
    secrets=[_RENDER_SECRET],
)
# Satu ingest per container: transkripsi cpu-bound penuh. Request concurrent
# dapat container baru (scale-out Modal), bukan thread di container sama.
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def web():
    import os

    from fastapi import Depends, FastAPI, HTTPException
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    from starlette.concurrency import run_in_threadpool

    api = FastAPI(title="SahabatKreator clipper")
    auth = HTTPBearer()

    def verify(creds: HTTPAuthorizationCredentials = Depends(auth)) -> None:
        if creds.credentials != os.environ["MODAL_TOKEN"]:
            raise HTTPException(status_code=401, detail="unauthorized")

    @api.get("/health")
    async def health(_: None = Depends(verify)) -> dict:
        return {"status": "ok", "app": "sahabatkreator-clipper"}

    @api.post("/ingest")
    async def ingest(item: dict, _: None = Depends(verify)) -> dict:
        # Pipeline blocking (ffmpeg/whisper) di threadpool agar event loop sehat.
        # Container cuma pegang 1 request (max_inputs=1).
        try:
            return await run_in_threadpool(_ingest_sync, item)
        except Exception as exc:
            return {
                "status": "failed",
                "code": "ingest_error",
                "message": str(exc)[:400],
                "retryable": _retryable(exc),
            }

    return api
