"""
Modal function — carousel (slideshow) render SahabatKreator.

Port renderer.py dari E:\\PROJECTS\\tiktok-carousel-generator (Pillow murni).

APLIKASI TERPISAH dari sk_render.py:
  - sk_render.py   = video (ffmpeg + faster-whisper) — image berat
  - sk_carousel.py = carousel (Pillow saja)          — image ringan, cold start cepat
Keduanya pakai Modal secret yang sama (sk-render-auth / MODAL_TOKEN).

Deploy terpisah dari monorepo TS:

    cd apps/render-modal
    modal deploy src/sk_carousel.py    # output: URL function → MODAL_CAROUSEL_URL

Endpoint (FastAPI, auth Bearer MODAL_TOKEN):
    GET  /health     — smoke test
    POST /carousel   — render N slide, sync sampai selesai

Input/Output via R2 presigned URL (server tidak sentuh byte gambar):
  - background: GET presigned (atau null → gradient solid di-generate)
  - slide out : PUT presigned JPEG q95

RFC: docs/rfc-carousel-render.md

Yang SENGJA TIDAK ada (sama dengan RFC video render §2):
  - integrasi LLM native (AI outline + vision ada di sisi TS/OpenRouter)
  - Streamlit / topic queue JSON / context.txt (diganti app TS)
"""
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import modal

# ---------------------------------------------------------------- image
# Pillow + requests saja. Font bundle (subset OFL) di-copy saat build.
# Smoke test import + cek font ada — pola tiga bug dependency di sk_render.py.
_FONTS_DIR = "/fonts"
_FONT_FILES = [
    "Fredoka-Bold.ttf", "Fredoka-SemiBold.ttf", "Fredoka-Regular.ttf",
    "Cinzel-Bold.ttf", "Cinzel-Regular.ttf",
    "Bangers-Regular.ttf",
    "Caveat-Bold.ttf", "Caveat-Regular.ttf",
    "Montserrat-Bold.ttf", "Montserrat-Regular.ttf",
]

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("pillow>=11", "requests>=2.31")
    .add_local_dir("fonts", _FONTS_DIR)
    .run_commands(
        'python -c "from PIL import Image, ImageDraw, ImageFont; '
        f"import os; assert all(os.path.exists('{_FONTS_DIR}/' + f) for f in {_FONT_FILES!r}), 'font bundle missing'; "
        "print('carousel deps ok')\""
    )
)

app = modal.App("sahabatkreator-carousel", image=image)

# Token Bearer yang sama dengan MODAL_TOKEN di env server SahabatKreator
# (secret yang dipakai sk_render.py juga).
_RENDER_SECRET = modal.Secret.from_name("sk-render-auth")


# ---------------------------------------------------------------- canvas presets
# Port config.py referensi: base defaults + override per format, jadi dict murni
# (bukan global mutable) supaya thread-safe untuk banyak request.
_BASE = {
    "titleFontSize": 65,
    "contentFontSize": 50,
    "autoShrinkMin": 45,
    "shrinkStep": 2,
    "safeTopBottomMargin": 140,
    "textSideMargin": 60,
    "boxPadding": 16,
    "radiusExtra": 18,
    "lineSpacing": 10,
    "titleBoxFontBonus": 5,
    "titleContentSpacing": 60,
    "paragraphSpacing": 25,
}

_FORMATS = {
    # 9:16 — story/reels & target export video (fase 3 RFC §8)
    "portrait": {"w": 1080, "h": 1920, **_BASE},
    # 4:5 — FEED carousel IG/FB (rekomendasi, bukan 9:16 yang tercrop di feed)
    "portrait4_5": {
        **_BASE,
        "w": 1080, "h": 1350,
        "titleFontSize": 62, "contentFontSize": 48,
        "autoShrinkMin": 40, "safeTopBottomMargin": 110, "textSideMargin": 56,
        "boxPadding": 17, "radiusExtra": 16,
        "lineSpacing": 9, "titleContentSpacing": 48, "paragraphSpacing": 22,
    },
    # 1:1 — IG/FB feed
    "square": {
        **_BASE,
        "w": 1080, "h": 1080,
        "titleFontSize": 58, "contentFontSize": 42,
        "autoShrinkMin": 30, "safeTopBottomMargin": 40, "textSideMargin": 50,
        "boxPadding": 18, "radiusExtra": 10,
        "lineSpacing": 8, "titleContentSpacing": 30, "paragraphSpacing": 14,
    },
}

# Default fallback bila font family tidak dikenal.
_DEFAULT_TITLE = ("Montserrat", "Bold")
_DEFAULT_CONTENT = ("Montserrat", "Regular")

# Warna (port config.py) — box putih, outline putih+stroke hitam, plain putih+shadow.
_BOX_TEXT_FILL = (0, 0, 0)
_OUTLINE_TEXT_FILL = "white"
_OUTLINE_STROKE_FILL = "black"
_OUTLINE_STROKE_RATIO = 0.08
_PLAIN_TEXT_FILL = "white"
_PLAIN_SHADOW_FILL = (0, 0, 0, 180)
_PLAIN_SHADOW_OFFSET = 3
_JPG_QUALITY = 95


# ---------------------------------------------------------------- font resolution
def _font_path(family: Optional[str], weight: str) -> str:
    """Resolve family + weight ke path file font bundle dengan fallback.

    Fallback chain: exact weight → Bold (title) / Regular (content) → Montserrat.
    """
    fam = (family or "").strip() or "Montserrat"
    # Normalisasi: "Fredoka", "fredoka", "Fredoka SemiBold" → "Fredoka"
    fam = "".join(ch for ch in fam if ch.isalpha())
    candidates = [f"{fam}-{weight}.ttf", f"{fam}-Bold.ttf", f"{fam}-Regular.ttf"]
    if fam != "Montserrat":
        # Font bundle hanya punya Bold & Regular per family (kecuali Fredoka)
        candidates += [
            f"Montserrat-{weight}.ttf", "Montserrat-Bold.ttf", "Montserrat-Regular.ttf",
        ]
    for name in candidates:
        p = f"{_FONTS_DIR}/{name}"
        if Path(p).is_file():
            return p
    return f"{_FONTS_DIR}/Montserrat-Regular.ttf"


def _load_font(path: str, size: int):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(path, size)
    except (IOError, OSError):
        return ImageFont.load_default()


# ---------------------------------------------------------------- text layout
def _wrap_text(draw, text: str, font, max_width: int) -> str:
    """Wrap teks per baris berdasarkan lebar piksel (port renderer.py)."""
    final_lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            final_lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            bbox = draw.textbbox((0, 0), candidate, font=font)
            if (bbox[2] - bbox[0]) <= max_width:
                current = candidate
            else:
                final_lines.append(current)
                current = word
        final_lines.append(current)
    return "\n".join(final_lines)


def _text_layout(draw, text: str, font, fmt: dict, style: str, box_pad: int):
    """Hitung layout blok teks ter-wrap (port _calculate_text_layout)."""
    side = fmt["textSideMargin"]
    max_w = fmt["w"] - (side * 2) - (box_pad * 2 if style in ("box", "box-title-content") else 0)
    wrapped = _wrap_text(draw, text, font, max_w)
    bbox = draw.multiline_textbbox((0, 0), wrapped, font=font, align="center",
                                   spacing=fmt["lineSpacing"])
    t_w, t_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    block_h = t_h + (box_pad * 2 if style in ("box", "box-title-content") else 0)
    return {"wrapped": wrapped, "width": t_w, "height": t_h,
            "block_height": block_h, "offset_x": bbox[0], "offset_y": bbox[1]}


def _fit_font(draw, text: str, initial_size: int, font_path: str, fmt: dict, style: str,
              box_pad: int):
    """Auto-shrink: kecilkan font sampai blok teks muat di area aman.

    Selalu aktif (referensi default-nya bisa off untuk portrait — untuk SaaS,
    overflow teks adalah bug visual yang pasti ditemui user).
    """
    max_h = fmt["h"] - (fmt["safeTopBottomMargin"] * 2)
    size = initial_size
    layout = _text_layout(draw, text, _load_font(font_path, size), fmt, style, box_pad)
    while size > fmt["autoShrinkMin"] and layout["block_height"] > max_h:
        size -= fmt["shrinkStep"]
        layout = _text_layout(draw, text, _load_font(font_path, size), fmt, style, box_pad)
    return size, layout


# ---------------------------------------------------------------- background
def _fit_crop(img, target: tuple[int, int]):
    """Resize + center-crop ke rasio target (port process_slide langkah crop)."""
    from PIL import Image
    tw, th = target
    img_ratio = img.width / img.height
    target_ratio = tw / th
    if img_ratio > target_ratio:
        img = img.resize((int(th * img_ratio), th), Image.Resampling.LANCZOS)
    else:
        img = img.resize((tw, int(tw / img_ratio)), Image.Resampling.LANCZOS)
    left = (img.width - tw) / 2
    top = (img.height - th) / 2
    return img.crop((left, top, left + tw, top + th))


def _solid_gradient(target: tuple[int, int], stops: Optional[list[str]]) -> "Image.Image":
    """Background gradient diagonal dari 2 hex stop (backgroundMode='solid').

    stops[0] atas, stops[1] bawah. Default: ungu→biru gelap.
    """
    from PIL import Image

    def hex_rgb(h: str, default: tuple[int, int, int]) -> tuple[int, int, int]:
        h = (h or "").lstrip("#")
        if len(h) == 6:
            try:
                return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
            except ValueError:
                pass
        return default

    s = stops or []
    top_c = hex_rgb(s[0] if len(s) > 0 else "", (88, 28, 135))
    bot_c = hex_rgb(s[1] if len(s) > 1 else "", (21, 21, 53))
    tw, th = target
    base = Image.new("RGB", (1, th))
    px = base.load()
    for y in range(th):
        t = y / max(1, th - 1)
        px[0, y] = tuple(int(top_c[i] + (bot_c[i] - top_c[i]) * t) for i in range(3))
    return base.resize((tw, th), Image.Resampling.BICUBIC)


# ---------------------------------------------------------------- slide render
def _render_slide(bg, slide: dict, fmt: dict, style: str, box_opacity: int,
                  title_family: str, content_family: str) -> "Image.Image":
    """Render satu slide: background + teks sesuai style (port process_slide)."""
    from PIL import Image, ImageDraw

    target = (fmt["w"], fmt["h"])
    img = _fit_crop(bg, target).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    box_pad = fmt["boxPadding"]
    box_fill = (255, 255, 255, int(box_opacity))
    title = (slide.get("title") or "").strip()
    body = (slide.get("body") or "").strip()
    is_cover = not body  # slide 0 (cover) hanya judul

    # ---- style box-title-content: judul uppercase di box atas + isi per paragraf
    if style == "box-title-content" and body and title:
        from PIL import ImageFont
        title_path = _font_path(title_family, "Bold")
        content_path = _font_path(content_family, "Regular")
        t_size = fmt["titleFontSize"] + fmt["titleBoxFontBonus"]
        c_size = fmt["contentFontSize"]
        max_h = fmt["h"] - (fmt["safeTopBottomMargin"] * 2)
        max_p_w = fmt["w"] - (fmt["textSideMargin"] * 2) - (box_pad * 2)

        # Auto-shrink title+content bersamaan (port _get_best_fitting_box_title_content_layout)
        while True:
            t_font = _load_font(title_path, t_size)
            c_font = _load_font(content_path, c_size)
            wrapped_title = _wrap_text(draw, title.upper(), t_font, max_p_w)
            t_bbox = draw.multiline_textbbox((0, 0), wrapped_title, font=t_font,
                                             align="center", spacing=fmt["lineSpacing"])
            t_w, t_h = t_bbox[2] - t_bbox[0], t_bbox[3] - t_bbox[1]
            t_box_h = t_h + (box_pad * 2)

            paras = []
            total = t_box_h + fmt["titleContentSpacing"]
            for para in [p.strip() for p in body.split("\n") if p.strip()]:
                w = _wrap_text(draw, para, c_font, max_p_w)
                pb = draw.multiline_textbbox((0, 0), w, font=c_font, spacing=fmt["lineSpacing"])
                paras.append({"text": w, "width": pb[2] - pb[0], "height": pb[3] - pb[1],
                              "offset_x": pb[0], "offset_y": pb[1]})
                total += (pb[3] - pb[1]) + (box_pad * 2) + fmt["paragraphSpacing"]
            if paras:
                total -= fmt["paragraphSpacing"]

            if total <= max_h or c_size <= fmt["autoShrinkMin"]:
                break
            t_size -= fmt["shrinkStep"]
            c_size -= fmt["shrinkStep"]

        start_y = (img.height - total) / 2

        # box judul
        tx = (img.width - t_w) / 2
        draw.rounded_rectangle(
            [tx - box_pad, start_y, tx + t_w + box_pad, start_y + t_box_h],
            radius=box_pad + fmt["radiusExtra"], fill=box_fill,
        )
        draw.multiline_text(
            (tx - t_bbox[0], start_y + box_pad - t_bbox[1]), wrapped_title,
            font=t_font, fill=_BOX_TEXT_FILL, align="center", spacing=fmt["lineSpacing"],
        )
        cy = start_y + t_box_h + fmt["titleContentSpacing"]
        for para in paras:
            px = fmt["textSideMargin"] + box_pad
            box_r = px + max(para["width"], 10) + box_pad
            box_b = cy + para["height"] + (box_pad * 2)
            draw.rounded_rectangle(
                [px - box_pad, cy, box_r, box_b],
                radius=box_pad + fmt["radiusExtra"], fill=box_fill,
            )
            draw.multiline_text(
                (px - para["offset_x"], cy + box_pad - para["offset_y"]), para["text"],
                font=c_font, fill=_BOX_TEXT_FILL, align="left", spacing=fmt["lineSpacing"],
            )
            cy = box_b + fmt["paragraphSpacing"]

        return Image.alpha_composite(img, overlay).convert("RGB")

    # ---- style lainnya (outline / box / plain): satu blok teks
    font_path = _font_path(title_family if is_cover else content_family,
                           "Bold" if is_cover else "Regular")
    initial = fmt["titleFontSize"] if is_cover else fmt["contentFontSize"]
    text = title if is_cover else body
    size, layout = _fit_font(draw, text, initial, font_path, fmt, style, box_pad)
    font = _load_font(font_path, size)
    wrapped = layout["wrapped"]
    x = (img.width - layout["width"]) / 2
    y = (img.height - layout["height"]) / 2

    if style == "outline":
        stroke = max(2, int(size * _OUTLINE_STROKE_RATIO))
        draw.multiline_text(
            (x - layout["offset_x"], y - layout["offset_y"]), wrapped, font=font,
            fill=_OUTLINE_TEXT_FILL, align="center", spacing=fmt["lineSpacing"],
            stroke_width=stroke, stroke_fill=_OUTLINE_STROKE_FILL,
        )
    elif style == "box":
        draw.rounded_rectangle(
            [x - box_pad, y - box_pad, x + layout["width"] + box_pad,
             y + layout["height"] + box_pad],
            radius=box_pad + fmt["radiusExtra"], fill=box_fill,
        )
        draw.multiline_text(
            (x - layout["offset_x"], y - layout["offset_y"]), wrapped, font=font,
            fill=_BOX_TEXT_FILL, align="center", spacing=fmt["lineSpacing"],
        )
    else:  # plain — teks putih + drop shadow halus
        off = _PLAIN_SHADOW_OFFSET
        draw.multiline_text(
            (x - layout["offset_x"] + off, y - layout["offset_y"] + off), wrapped,
            font=font, fill=_PLAIN_SHADOW_FILL, align="center", spacing=fmt["lineSpacing"],
        )
        draw.multiline_text(
            (x - layout["offset_x"], y - layout["offset_y"]), wrapped, font=font,
            fill=_PLAIN_TEXT_FILL, align="center", spacing=fmt["lineSpacing"],
        )

    return Image.alpha_composite(img, overlay).convert("RGB")


# ---------------------------------------------------------------- pipeline
def _download(url: str, dest: str) -> None:
    """Download presigned URL ke file lokal."""
    import shutil
    import urllib.error
    import urllib.request

    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "SahabatKreator-Carousel/1.0"}
        )
        with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
    except urllib.error.URLError as exc:
        raise RuntimeError(f"download gagal {url[:80]}: {exc}")


def _upload(local: str, presigned_url: str, content_type: str) -> None:
    """PUT file ke R2 via presigned URL. Content-Type WAJIB cocok dengan signature."""
    import urllib.error
    import urllib.request

    data = Path(local).read_bytes()
    req = urllib.request.Request(
        presigned_url, data=data, method="PUT", headers={"Content-Type": content_type}
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            r.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"upload gagal HTTP {exc.code}: {exc.read()[:300]}")


def _run_pipeline(req: dict, tmpdir: str) -> dict:
    """Render semua slide. Throw bila gagal (dipetakan caller ke retryable)."""
    from PIL import Image

    fmt_name = req.get("format") or "portrait4_5"
    if fmt_name not in _FORMATS:
        raise RuntimeError(f"format tidak dikenal: {fmt_name}")
    fmt = _FORMATS[fmt_name]
    style = req.get("style") or "box"
    if style not in ("outline", "box", "box-title-content", "plain"):
        raise RuntimeError(f"style tidak dikenal: {style}")
    box_opacity = min(255, max(0, int(req.get("boxOpacity") or 235)))
    title_family = req.get("titleFontFamily") or "Fredoka"
    content_family = req.get("contentFontFamily") or "Fredoka"

    slides = req.get("slides") or []
    if not slides:
        raise RuntimeError("tidak ada slide untuk di-render")

    results = []
    for slide in slides:
        bg_url = slide.get("backgroundUrl")
        bg_stops = slide.get("backgroundStops")
        if bg_url:
            bg_path = f"{tmpdir}/bg_{slide.get('urutan', 0)}.jpg"
            _download(bg_url, bg_path)
            with Image.open(bg_path) as bg:
                bg.load()
                rendered = _render_slide(bg, slide, fmt, style, box_opacity,
                                         title_family, content_family)
        else:
            bg = _solid_gradient((fmt["w"], fmt["h"]), bg_stops)
            rendered = _render_slide(bg, slide, fmt, style, box_opacity,
                                     title_family, content_family)

        out = f"{tmpdir}/slide_{slide.get('urutan', 0)}.jpg"
        rendered.save(out, "JPEG", quality=_JPG_QUALITY)
        upload_url = slide.get("uploadUrl")
        if upload_url:
            _upload(out, upload_url, "image/jpeg")
        results.append({
            "urutan": slide.get("urutan", 0),
            "width": rendered.width,
            "height": rendered.height,
            "sizeBytes": Path(out).stat().st_size,
        })

    return {"slides": results}


def _carousel_sync(req: dict) -> dict:
    """Satu job carousel sync: render, hapus tmpdir, kembalikan hasil."""
    req_id = req.get("jobId") or str(uuid.uuid4())
    tmpdir = tempfile.mkdtemp(prefix=f"sk_carousel_{req_id}_")
    try:
        result = _run_pipeline(req, tmpdir)
        return {"status": "done", **result}
    except Exception as exc:
        return {
            "status": "failed",
            "code": "pipeline_error",
            "message": str(exc)[:400],
            "retryable": True,
        }
    finally:
        import subprocess
        subprocess.run(["rm", "-rf", tmpdir], capture_output=True)


# ---------------------------------------------------------------- endpoint
@app.function(
    image=image,
    # Pillow ringan: 0.5 core cukup, hemat biaya. RAM 1GB untuk font + canvas 1080p.
    cpu=0.5,
    memory=1024,
    secrets=[_RENDER_SECRET],
)
# Satu job per container — render cepat, scale-out Modal bikin container baru
# per request concurrent.
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def web():
    import os

    from fastapi import Depends, FastAPI, HTTPException
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    from starlette.concurrency import run_in_threadpool

    api = FastAPI(title="SahabatKreator carousel")
    auth = HTTPBearer()

    def verify(creds: HTTPAuthorizationCredentials = Depends(auth)) -> None:
        if creds.credentials != os.environ["MODAL_TOKEN"]:
            raise HTTPException(status_code=401, detail="unauthorized")

    @api.get("/health")
    async def health(_: None = Depends(verify)) -> dict:
        return {"status": "ok"}

    @api.post("/carousel")
    async def carousel(item: dict, _: None = Depends(verify)) -> dict:
        # Pillow cpu-bound ringan; tetap di threadpool agar event loop sehat.
        return await run_in_threadpool(_carousel_sync, item)

    return api
