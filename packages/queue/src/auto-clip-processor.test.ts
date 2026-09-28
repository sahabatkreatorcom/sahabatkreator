// Test untuk parseExplicitRanges — parsing input bebas user ("0:30-1:15, ambil
// 2:00 sampai 2:45") menjadi rentang detik untuk auto-clip.
//
// MENGAPA: ini satu-satunya tempat input bebas user diterjemahkan jadi
// parameter render. Off-by-one / salah parsing langsung memotong klip di
// detik yang salah — terlihat "berhasil" padahal kontennya rusak, dan tidak
// ada cara lain mendeteksinya selain inspeksi manual video output.
import { describe, expect, it } from "vitest";
import { parseExplicitRanges } from "./auto-clip-processor";

describe("parseExplicitRanges", () => {
  it("mengembalikan array kosong tanpa input", () => {
    expect(parseExplicitRanges(undefined)).toEqual([]);
    expect(parseExplicitRanges(null)).toEqual([]);
    expect(parseExplicitRanges("")).toEqual([]);
  });

  it("mengembalikan [] untuk teks tanpa rentang waktu", () => {
    expect(parseExplicitRanges("buatkan klip yang lucu dari bagian terbaik")).toEqual([]);
  });

  it("memparse rentang m:ss → detik", () => {
    expect(parseExplicitRanges("0:30-1:15")).toEqual([{ start: 30, end: 75 }]);
  });

  it("memparse format hh:mm:ss", () => {
    expect(parseExplicitRanges("0:00:30-0:01:15")).toEqual([{ start: 30, end: 75 }]);
  });

  it("memparse beberapa rentang sekaligus", () => {
    const out = parseExplicitRanges("0:30-1:15, dan 2:00-2:45");
    expect(out).toEqual([
      { start: 30, end: 75 },
      { start: 120, end: 165 },
    ]);
  });

  it("menerima beragam separator (– — sampai smp to until)", () => {
    for (const sep of ["-", "–", "—", "sampai", "smp", "to", "until"]) {
      expect(parseExplicitRanges(`0:10${sep}0:20`), `separator "${sep}"`).toEqual([
        { start: 10, end: 20 },
      ]);
    }
  });

  it("mengabaikan rentang terbalik (end <= start)", () => {
    expect(parseExplicitRanges("1:15-0:30")).toEqual([]);
    expect(parseExplicitRanges("1:00-1:00")).toEqual([]);
  });

  it("memparse menit > 60 (menit tanpa padding)", () => {
    expect(parseExplicitRanges("75:00-80:00")).toEqual([{ start: 4500, end: 4800 }]);
  });
});
