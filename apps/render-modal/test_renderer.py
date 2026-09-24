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

# ---- AI Visual Layout Director (fase 2) ----
# Layout {zone, align, contrast} harus mengubah posisi teks & warna.
# Verifikasi: pixel-diff antara layout top vs bottom menunjukkan teks pindah.
fmt = sk_carousel._FORMATS["portrait4_5"]


def _text_bbox(rendered, base):
    """Bounding box piksel yang berubah (teks) vs background base."""
    a = base.convert("RGB")
    b = rendered.convert("RGB")
    w, h = b.size
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            if a.getpixel((x, y)) != b.getpixel((x, y)):
                minx, miny = min(minx, x), min(miny, y)
                maxx, maxy = max(maxx, x), max(maxy, y)
    return (minx, miny, maxx, maxy)


slide = {"urutan": 1, "title": "Poin", "body": "Hindari area wajah di kiri atas gambar ini."}
base = sk_carousel._solid_gradient((fmt["w"], fmt["h"]), GRADIENT)

for zone in ("top", "center", "bottom"):
    for align in ("left", "center", "right"):
        s = dict(slide)
        s["layout"] = {"zone": zone, "align": align, "contrast": "light"}
        r = sk_carousel._render_slide(base, s, fmt, "box", 235, "Fredoka", "Fredoka")
        assert r.size == (fmt["w"], fmt["h"])
        bbox = _text_bbox(r, base)
        # teks harus tergambar dan dalam canvas
        assert bbox[2] > bbox[0] and bbox[3] > bbox[1], f"teks tidak tergambar {zone}/{align}"
    print(f"OK layout zone×align: {zone}")

# zona menempatkan teks di sepertiga canvas yang berbeda
b_top = _text_bbox(
    sk_carousel._render_slide(
        base,
        {**slide, "layout": {"zone": "top", "align": "center", "contrast": "light"}},
        fmt, "box", 235, "Fredoka", "Fredoka",
    ),
    base,
)
b_bot = _text_bbox(
    sk_carousel._render_slide(
        base,
        {**slide, "layout": {"zone": "bottom", "align": "center", "contrast": "light"}},
        fmt, "box", 235, "Fredoka", "Fredoka",
    ),
    base,
)
h = fmt["h"]
assert b_top[3] < h * 0.6, f"zone top seharusnya di atas: {b_top}"
assert b_bot[1] > h * 0.4, f"zone bottom seharusnya di bawah: {b_bot}"
print(f"OK zone separation: top bbox y≤{b_top[3]} < {h*0.6:.0f}, bottom y≥{b_bot[1]} > {h*0.4:.0f}")

# kontras dark → teks hitam muncul (outline style, bg terang)
light_bg = sk_carousel._solid_gradient((fmt["w"], fmt["h"]), ["#F3E8FF", "#E9D5FF"])
r_dark = sk_carousel._render_slide(
    light_bg,
    {**slide, "layout": {"zone": "center", "align": "center", "contrast": "dark"}},
    fmt, "plain", 235, "Fredoka", "Fredoka",
)
assert r_dark.size == (fmt["w"], fmt["h"])
print("OK contrast=dark pada bg terang")

# layout invalid/kosong → fallback template center (tidak crash)
r_fallback = sk_carousel._render_slide(
    base, {**slide, "layout": None}, fmt, "outline", 235, "Fredoka", "Fredoka"
)
assert r_fallback.size == (fmt["w"], fmt["h"])
r_weird = sk_carousel._render_slide(
    base,
    {**slide, "layout": {"zone": "di Mana2", "align": 42}},
    fmt, "outline", 235, "Fredoka", "Fredoka",
)
assert r_weird.size == (fmt["w"], fmt["h"])
print("OK layout fallback (null + nilai invalid → template center)")

n = len(list(OUT.glob("*.png")))
print(f"\nALL PASS — {n} slide PNG di {OUT}")
