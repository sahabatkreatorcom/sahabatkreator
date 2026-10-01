// Penjaga kebersihan fixture dokumentasi.
//
// Fixture di scripts/docs-fixtures/fixtures.json dipakai untuk menghasilkan
// tangkapan layar yang TAYANG di halaman publik. Isinya harus sepenuhnya
// karangan. Uji ini memeriksa hal-hal yang bisa diperiksa tanpa akses ke data
// asli:
//
//   • tidak ada URL ke penyimpanan pihak ketiga (CDN Meta/LinkedIn/Bluesky/R2)
//     — tautan seperti itu juga kedaluwarsa, jadi cepat atau lambat jadi gambar
//     rusak di dokumentasi;
//   • setiap aset yang dirujuk benar-benar ada di public/docs/mock/;
//   • tidak ada alamat email selain domain contoh;
//   • struktur minimum yang dibutuhkan agar halaman bisa dirender ada.
//
// Pemeriksaan yang butuh data asli (apakah ada nilai yang lolos tanpa
// disanitasi) dilakukan oleh scripts/docs-fixtures.sanitize.ts, karena hanya di
// sana rekaman mentahnya tersedia.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(import.meta.dirname, "..", "..");
const FIXTURE_FILE = path.join(WEB_ROOT, "scripts", "docs-fixtures", "fixtures.json");
const PUBLIC_DIR = path.join(WEB_ROOT, "public");

type FixtureResponse = { status: number; contentType: string; json: unknown };
type Fixtures = { recordedAt: string; responses: Record<string, FixtureResponse> };

/** Penyimpanan pihak ketiga yang tidak boleh muncul di fixture. */
const THIRD_PARTY_ASSET =
  /(fbcdn\.net|fbsbx\.com|licdn\.com|bsky\.app|cloudflarestorage\.com|cdninstagram\.com|twimg\.com|graph\.facebook\.com|googleusercontent\.com)/i;

function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const item of node) collectStrings(item, out);
  else if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectStrings(value, out);
  }
  return out;
}

describe("fixture dokumentasi", () => {
  const exists = existsSync(FIXTURE_FILE);
  const fixtures = exists ? (JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as Fixtures) : null;

  it("berkas fixture tersedia", () => {
    expect(exists, "jalankan docs:fixtures:record lalu docs:fixtures:sanitize").toBe(true);
  });

  it("tidak merujuk penyimpanan pihak ketiga", () => {
    const offenders = collectStrings(fixtures?.responses ?? {}).filter((value) =>
      THIRD_PARTY_ASSET.test(value),
    );
    expect(offenders).toEqual([]);
  });

  it("setiap aset yang dirujuk ada di public/docs/mock/", () => {
    const assets = collectStrings(fixtures?.responses ?? {}).filter((value) =>
      value.startsWith("/docs/mock/"),
    );
    expect(assets.length).toBeGreaterThan(0);
    // URL membawa penanda versi (?v=) sebagai kunci cache CDN — bukan bagian
    // dari nama berkas, jadi dibuang dulu sebelum dicek ke disk.
    const missing = [...new Set(assets)].filter(
      (asset) => !existsSync(path.join(PUBLIC_DIR, asset.split("?")[0] as string)),
    );
    expect(missing).toEqual([]);
  });

  it("tidak memuat alamat email sungguhan", () => {
    const emails = collectStrings(fixtures?.responses ?? {}).filter((value) =>
      /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value),
    );
    expect(emails.filter((email) => !email.endsWith("@contoh.id"))).toEqual([]);
  });

  it("menyertakan sesi /api/me yang sudah masuk, supaya halaman dashboard bisa dirender", () => {
    const me = fixtures?.responses["GET /api/me"];
    expect(me).toBeDefined();
    expect((me?.json as { authenticated?: boolean } | undefined)?.authenticated).toBe(true);
  });

  it("cukup banyak respons untuk merender seluruh halaman", () => {
    expect(Object.keys(fixtures?.responses ?? {}).length).toBeGreaterThan(20);
  });
});
