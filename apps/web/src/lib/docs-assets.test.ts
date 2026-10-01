// Penjaga aset dokumentasi.
//
// Dokumentasi /panduan dan /developers memakai tangkapan layar asli dari
// produksi (lihat scripts/docs-screenshots.ts). Dua hal pernah salah dan
// keduanya tidak terlihat sampai ada yang membuka halamannya:
//
//   1. Gambar tersimpan di public/docs/ tapi tidak dirujuk halaman mana pun —
//      bobot mati yang ikut ter-deploy.
//   2. Gambar dirujuk halaman, tapi isinya halaman yang salah (pernah terjadi:
//      empat "tangkapan layar dashboard" ternyata halaman login, karena kuota
//      rate limit melempar sesi ke /login di tengah proses).
//
// Nomor 2 tidak bisa dideteksi dari sini — itu dijaga di dalam skrip
// pengambilan gambar. Yang bisa dijaga di sini: rujukan yang benar-benar ada,
// tidak ada aset yatim, dan setiap gambar punya alt + caption.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTENT_DIR = path.join(WEB_ROOT, "src", "content");
const PUBLIC_DIR = path.join(WEB_ROOT, "public");

type ScreenshotUse = {
  file: string;
  src: string;
  alt: string | null;
  caption: string | null;
};

function walk(dir: string, extension: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, extension));
    else if (entry.endsWith(extension)) out.push(full);
  }
  return out;
}

function attribute(block: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`).exec(block)?.[1] ?? null;
}

/** Semua pemakaian <Screenshot … /> di seluruh berkas .mdx. */
function screenshotUses(): ScreenshotUse[] {
  const uses: ScreenshotUse[] = [];
  for (const file of walk(CONTENT_DIR, ".mdx")) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<Screenshot\b[^>]*?\/>/g)) {
      const block = match[0];
      uses.push({
        file: path.relative(CONTENT_DIR, file),
        src: attribute(block, "src") ?? "",
        alt: attribute(block, "alt"),
        caption: attribute(block, "caption"),
      });
    }
  }
  return uses;
}

describe("aset dokumentasi", () => {
  const uses = screenshotUses();

  it("memakai setidaknya satu tangkapan layar di dokumentasi", () => {
    expect(uses.length).toBeGreaterThan(0);
  });

  it("setiap src menunjuk berkas yang benar-benar ada", () => {
    const missing = uses
      .filter(
        (use) =>
          use.src === "" || !statSync(path.join(PUBLIC_DIR, use.src), { throwIfNoEntry: false }),
      )
      .map((use) => `${use.file} → ${use.src || "(src kosong)"}`);
    expect(missing).toEqual([]);
  });

  it("setiap src diarahkan ke /docs/ dan berekstensi .webp", () => {
    const wrong = uses
      .filter((use) => !use.src.startsWith("/docs/") || !use.src.endsWith(".webp"))
      .map((use) => `${use.file} → ${use.src}`);
    expect(wrong).toEqual([]);
  });

  it("setiap gambar punya alt dan caption yang menjelaskan isinya", () => {
    const incomplete = uses
      .filter((use) => !use.alt || use.alt.length < 20 || !use.caption || use.caption.length < 10)
      .map((use) => `${use.file} → ${use.src}`);
    expect(incomplete).toEqual([]);
  });

  it("tidak ada tangkapan layar yatim di public/docs/", () => {
    const used = new Set(uses.map((use) => use.src));
    const onDisk = walk(path.join(PUBLIC_DIR, "docs"), ".webp").map(
      (file) => `/${path.relative(PUBLIC_DIR, file).split(path.sep).join("/")}`,
    );
    expect(onDisk.length).toBeGreaterThan(0);
    expect(onDisk.filter((src) => !used.has(src))).toEqual([]);
  });

  it("setiap tangkapan layar dipakai tepat satu kali", () => {
    // Satu gambar = satu halaman. Kalau ada yang muncul dua kali, biasanya itu
    // sisa salin-tempel yang seharusnya diganti gambar halaman yang benar.
    const counts = new Map<string, number>();
    for (const use of uses) counts.set(use.src, (counts.get(use.src) ?? 0) + 1);
    const repeated = [...counts.entries()].filter(([, count]) => count > 1);
    expect(repeated).toEqual([]);
  });
});
