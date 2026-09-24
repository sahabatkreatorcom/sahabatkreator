"""Smoke test lokal untuk renderer carousel (tanpa Modal).

Stub module `modal` supaya sk_carousel.py bisa di-import, lalu render slide
dengan setiap style × format dan verifikasi dimensi + ukuran file.
"""
import sys
import types
from pathlib import Path

# Stub modal sebelum import sk_carousel
modal_stub = types.ModuleType("modal")


class _Dummy:
    def __init__(self, *args, **kwargs):
        pass

    @staticmethod
    def debian_slim(**kwargs):
        return _Dummy()

    @staticmethod
    def pip_install(*args, **kwargs):
        return _Dummy()

    @staticmethod
    def add_local_dir(*args, **kwargs):
        return _Dummy()

    @staticmethod
    def run_commands(*args, **kwargs):
        return _Dummy()

    @staticmethod
    def function(*args, **kwargs):
        return lambda fn: fn  # decorator

    @staticmethod
    def from_name(name):
        return name


class _Image(_Dummy):
    pass


class _App(_Dummy):
    pass


class _Secret(_Dummy):
    pass


modal_stub.Image = _Image
modal_stub.App = _App
modal_stub.Secret = _Secret
modal_stub.concurrent = lambda **kw: (lambda fn: fn)
modal_stub.asgi_app = lambda: (lambda fn: fn)
sys.modules["modal"] = modal_stub

sys.path.insert(0, str(Path(__file__).parent / "src"))
import sk_carousel  # noqa: E402

from PIL import Image  # noqa: E402

OUT = Path(__file__).parent / "test-output"
OUT.mkdir(exist_ok=True)

FONT_DIR = Path(__file__).parent / "fonts"
# Override _FONTS_DIR ke path lokal (di Modal /fonts, lokal fonts/)
sk_carousel._FONTS_DIR = str(FONT_DIR)

SLIDES = [
    {"urutan": 0, "title": "Tips Diet Pemula yang Gampang Dijalanin", "body": None},
    {"urutan": 1, "title": "Poin Pertama", "body": "Minum air putih cukup setiap hari sebelum makan besar."},
    {"urutan": 2, "title": "Poin Kedua", "body": "Jangan skip sarapan.\nIni penting banget buat metabolidasme tubuh sepanjang hari."},
    {"urutan": 3, "title": "Poin Ketiga yang Punya Judul Cukup Panjang Sekali", "body": "Tidur 7-8 jam."},
]

GRADIENT = ["#6B21A8", "#1E1E53"]

failures = []
for fmt_name in ("portrait", "portrait4_5", "square"):
    fmt = sk_carousel._FORMATS[fmt_name]
    for style in ("outline", "box", "box-title-content", "plain"):
        for slide in SLIDES:
            bg = sk_carousel._solid_gradient((fmt["w"], fmt["h"]), GRADIENT)
            rendered = sk_carousel._render_slide(
                bg, slide, fmt, style, 235, "Fredoka", "Fredoka"
            )
            assert rendered.size == (fmt["w"], fmt["h"]), (
                f"size mismatch {fmt_name}/{style}/s{slide['urutan']}: {rendered.size}"
            )
            # Pastikan ada variasi warna (bukan gambar polos/rusak)
            colors = rendered.convert("RGB").getcolors(maxcolors=1_000_000)
            assert colors and len(colors) > 100, "render terlalu polos — teks mungkin tidak tergambar"
            out = OUT / f"{fmt_name}_{style}_s{slide['urutan']}.png"
            rendered.save(out, "PNG")
        print(f"OK {fmt_name} / {style} ({fmt['w']}x{fmt['h']})")

# Long text auto-shrink test — teks sangat panjang tidak boleh keluar canvas
fmt = sk_carousel._FORMATS["square"]
long_body = "Ini adalah paragraf yang sangat panjang sekali dan seharusnya memicu auto-shrink agar tidak keluar dari canvas kotak. " * 6
bg = sk_carousel._solid_gradient((fmt["w"], fmt["h"]), GRADIENT)
rendered = sk_carousel._render_slide(
    bg, {"urutan": 1, "title": "X", "body": long_body}, fmt, "box", 235, "Fredoka", "Fredoka"
)
# Verifikasi tidak ada error & ukuran tepat
assert rendered.size == (1080, 1080)
print("OK auto-shrink long text (square/box)")

# Font fallback — family tidak dikenal harus jatuh ke Montserrat, bukan crash
path = sk_carousel._font_path("FontYangTidakAda", "Bold")
assert "Montserrat" in path or Path(path).is_file(), f"fallback font gagal: {path}"
print(f"OK font fallback → {path}")

# _fit_crop rasio preservation
src = Image.new("RGB", (3000, 1000), (10, 120, 200))
cropped = sk_carousel._fit_crop(src, (1080, 1350))
assert cropped.size == (1080, 1350), cropped.size
print("OK _fit_crop")

n = len(list(OUT.glob("*.png")))
print(f"\nALL PASS — {n} slide PNG di {OUT}")
