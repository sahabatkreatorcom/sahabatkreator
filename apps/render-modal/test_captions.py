"""Smoke test lokal untuk pipeline caption sk_render.py (tanpa Modal).

Stub module `modal` supaya sk_render.py bisa di-import, lalu verifikasi:
- _caption_chunks memecah segmen panjang jadi baris <=7 kata / <=5s / jeda >0.8s
- teks tanpa spasi (bug faster-whisper) direkonstruksi dari word timestamp
- segmen degenerate (end<=start / kosong) dibuang
- _chunks_to_srt: numbering urut, spasi benar
- _chunks_to_ass: tanpa spasi ganda, tanpa pemisah {\\k0} lama, durasi \\k
  teleskopik = durasi Dialogue (karaoke sinkron tanpa drift)
"""
import re
import sys
import types
from pathlib import Path

# Stub modal sebelum import sk_render
modal_stub = types.ModuleType("modal")


class _Dummy:
    def __init__(self, *args, **kwargs):
        pass

    @staticmethod
    def debian_slim(**kwargs):
        return _Dummy()

    @staticmethod
    def apt_install(*args, **kwargs):
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


modal_stub.Image = _Dummy
modal_stub.App = _Dummy
modal_stub.Secret = _Dummy
modal_stub.concurrent = lambda **kw: (lambda fn: fn)
modal_stub.asgi_app = lambda: (lambda fn: fn)
sys.modules["modal"] = modal_stub

sys.path.insert(0, str(Path(__file__).parent / "src"))
import sk_render  # noqa: E402


class W:
    """Word timestamp palsu - struktur sama dengan faster-whisper."""

    def __init__(self, word, start, end):
        self.word = word
        self.start = start
        self.end = end


class S:
    """Segment palsu - struktur sama dengan faster-whisper."""

    def __init__(self, start, end, text, words=None):
        self.start = start
        self.end = end
        self.text = text
        self.words = words or []


def _ass_ts(t: str) -> float:
    """Parse ASS H:MM:SS.cc -> detik."""
    h, m, rest = t.split(":")
    s, cs = rest.split(".")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(cs) / 100


# ---- 1. segmen 30 kata (12s) -> pecah <=7 kata ----
words = [W(f"k{i}", i * 0.4, i * 0.4 + 0.35) for i in range(30)]
seg = S(0, 12, " ".join(w.word for w in words), words)
chunks = sk_render._caption_chunks([seg])
assert chunks, "chunks kosong"
assert all(0 < len(c["words"]) <= 7 for c in chunks), (
    f"chunk melebihi 7 kata: {[len(c['words']) for c in chunks]}"
)
assert all(len(c["text"].split()) == len(c["words"]) for c in chunks), (
    "teks chunk bukan hasil join kata (spasi salah)"
)
assert chunks[0]["start"] == 0.0 and chunks[0]["words"][0]["text"] == "k0"
print(f"OK split 30 kata -> {len(chunks)} chunk <=7 kata")

# ---- 2. teks tanpa spasi direkonstruksi dari words ----
seg_nosp = S(0, 2, "inijugatanpaspasi", words[:4])
chunks_nosp = sk_render._caption_chunks([seg_nosp])
assert chunks_nosp[0]["text"] == "k0 k1 k2 k3", chunks_nosp[0]["text"]
print("OK rekonstruksi spasi dari word timestamp")

# ---- 3. segmen degenerate dibuang ----
chunks_deg = sk_render._caption_chunks([
    S(5, 5, "nol"), S(1, 2, "   "), S(3, 2, "negatif"), S(0, 1, ""),
])
assert chunks_deg == [], chunks_deg
print("OK segmen degenerate (end<=start / kosong) dibuang")

# ---- 4. jeda bicara >0.8s memecah chunk ----
gappy = [
    W("a", 0.0, 0.3), W("b", 0.35, 0.6), W("c", 0.65, 0.9),
    W("d", 3.0, 3.3), W("e", 3.35, 3.6),
]
chunks_gap = sk_render._caption_chunks([S(0, 4, "a b c d e", gappy)])
assert len(chunks_gap) == 2, [c["text"] for c in chunks_gap]
assert chunks_gap[0]["text"] == "a b c" and chunks_gap[1]["text"] == "d e"
print("OK jeda >0.8s -> chunk baru")

# ---- 5. durasi chunk >=5s memecah (tanpa jeda panjang) ----
slow = [W(f"w{i}", i * 1.15, i * 1.15 + 0.4) for i in range(12)]
chunks_slow = sk_render._caption_chunks([S(0, 15, "x", slow)])
assert all(
    (c["words"][-1]["end"] - c["words"][0]["start"]) < 5.0
    or len(c["words"]) == 1
    for c in chunks_slow
), [f"{len(c['words'])}k/{c['words'][-1]['end'] - c['words'][0]['start']:.1f}s" for c in chunks_slow]
assert all(len(c["words"]) <= 7 for c in chunks_slow)
print(f"OK split durasi >=5s -> {len(chunks_slow)} chunk")

# ---- 6. kata tunggal (end==start) -> chunk minimal 0.3s ----
chunks_min = sk_render._caption_chunks([S(1, 2, "halo", [W("halo", 1.0, 1.0)])])
assert len(chunks_min) == 1
assert abs(chunks_min[0]["end"] - 1.3) < 1e-6, chunks_min[0]
print("OK chunk minimal 0.3s")

# ---- 7. fallback tanpa words -> teks utuh 1 chunk ----
chunks_fallback = sk_render._caption_chunks([S(0, 3.5, "tanpa kata")])
assert len(chunks_fallback) == 1 and chunks_fallback[0]["words"] == []
assert chunks_fallback[0]["end"] >= 3.5
print("OK fallback tanpa word timestamp")

# ---- 8. SRT: numbering urut + spasi benar ----
srt = sk_render._chunks_to_srt(chunks)
numbers = [l for l in srt.splitlines() if l.isdigit()]
assert numbers == [str(i + 1) for i in range(len(numbers))], numbers
assert all(" --> " in l for l in srt.splitlines() if "-->" in l)
assert "k0 k1" in srt and "inijugatanpaspasi" not in srt
print(f"OK SRT {len(numbers)} cue, numbering urut")

# ---- 9. ASS: spasi tunggal, tanpa {\k0}, \\k teleskopik ----
cap = {"position": "bottom", "fontColor": "white", "fontSize": 24}
ass = sk_render._chunks_to_ass(chunks, cap, (1080, 1920), 42)
dialogues = [l for l in ass.splitlines() if l.startswith("Dialogue:")]
assert dialogues, "tidak ada Dialogue"
for d in dialogues:
    parts = d.split(",", 8)
    text = parts[8]
    assert "  " not in text, f"spasi ganda: {text!r}"
    assert r"{\k0}" not in text, f"pemisah lama {{\k0}} masih ada: {text!r}"
    assert text.startswith("{\\k"), text
    durs = [int(m) for m in re.findall(r"\{\\k(\d+)\}", text)]
    assert durs and all(v >= 1 for v in durs), durs
    dur_cs = round((_ass_ts(parts[2]) - _ass_ts(parts[1])) * 100)
    # teleskopik: sum(\k) harus == durasi Dialogue (drift nol)
    assert abs(sum(durs) - dur_cs) <= 1, (
        f"karaoke drift: sum={sum(durs)}cs vs durasi={dur_cs}cs - {text!r}"
    )
print(f"OK ASS {len(dialogues)} Dialogue - spasi benar, sum \\k == durasi")

# ---- 10. ASS fallback chunk tanpa words ----
ass_fb = sk_render._chunks_to_ass(chunks_fallback, cap, (1080, 1920), 42)
dlg_fb = [l for l in ass_fb.splitlines() if l.startswith("Dialogue:")]
assert len(dlg_fb) == 1 and r"{\k350}" in dlg_fb[0], dlg_fb
print("OK ASS fallback tanpa words (350cs = 3.5s)")

print("\nALL PASS - pipeline caption")
