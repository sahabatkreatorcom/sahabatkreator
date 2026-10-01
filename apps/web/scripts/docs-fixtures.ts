/**
 * Pemuat fixture untuk mode mockup tangkapan layar dokumentasi.
 *
 * Fixture adalah respons /api/** fiktif hasil `docs:fixtures:sanitize`. Dengan
 * memenuhi seluruh permintaan /api/** dari berkas ini, UI tetap dirender
 * aplikasi sungguhan — tapi tidak ada satu pun identitas nyata yang tampil, dan
 * prosesnya tidak menyentuh API server (bebas rate limit, hasil deterministik).
 *
 * Pencocokan permintaan:
 *   1. Kunci persis  — `GET /api/analytics/overview?days=30`
 *   2. Kunci ternormalisasi — parameter yang berubah sendiri (tanggal, cursor)
 *      nilainya diganti `*`, jadi `?from=2026-10-01T08%3A10%3A31.224Z` tetap
 *      ketemu walau jam dinding berbeda. Parameter lain (mis. `limit`) tetap
 *      dibedakan supaya `limit=10` dan `limit=50` tidak tertukar.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";

export type FixtureResponse = {
  status: number;
  contentType: string;
  json: unknown;
};

export type Fixtures = {
  recordedAt: string;
  responses: Record<string, FixtureResponse>;
};

const FIXTURE_FILE = path.resolve(import.meta.dirname, "docs-fixtures", "fixtures.json");

/** Parameter yang nilainya berubah sendiri antar proses. */
const VOLATILE_PARAM =
  /^(from|to|since|until|start|end|before|after|cursor|offset|page|t|ts|timestamp|_)$/i;

export function fixturesPath(): string {
  return FIXTURE_FILE;
}

export function loadFixtures(): Fixtures | null {
  if (!existsSync(FIXTURE_FILE)) return null;
  return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as Fixtures;
}

export function exactKey(method: string, url: string): string {
  const parsed = new URL(url);
  return `${method.toUpperCase()} ${parsed.pathname}${parsed.search}`;
}

export function normalizedKey(method: string, url: string): string {
  const parsed = new URL(url);
  const params = [...parsed.searchParams.entries()]
    .map(([name, value]) =>
      VOLATILE_PARAM.test(name) || /^\d{4}-\d{2}-\d{2}/.test(value)
        ? `${name}=*`
        : `${name}=${value}`,
    )
    .sort();
  return `${method.toUpperCase()} ${parsed.pathname}${params.length > 0 ? `?${params.join("&")}` : ""}`;
}

export type FixtureStats = {
  fulfilled: number;
  /** Permintaan yang tidak punya fixture — halaman mungkin tampil tidak lengkap. */
  missed: string[];
};

/**
 * Pasang pemenuh permintaan /api/** dari fixture. Setelah `installFixtures`,
 * halaman bisa dipakai tanpa login dan tanpa menyentuh API server.
 */
export function installFixtures(page: Page, fixtures: Fixtures): { stats: () => FixtureStats } {
  const byExact = new Map<string, FixtureResponse>();
  const byNormalized = new Map<string, FixtureResponse>();
  for (const [key, response] of Object.entries(fixtures.responses)) {
    byExact.set(key, response);
    const spaceAt = key.indexOf(" ");
    const method = key.slice(0, spaceAt);
    const url = key.slice(spaceAt + 1);
    const normalized = normalizedKey(method, `https://placeholder${url}`);
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, response);
  }

  const stats: FixtureStats = { fulfilled: 0, missed: [] };

  void page.route("**/api/**", (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();

    const response =
      byExact.get(exactKey(method, url)) ?? byNormalized.get(normalizedKey(method, url));

    if (!response) {
      const key = exactKey(method, url);
      if (!stats.missed.includes(key)) stats.missed.push(key);
      // Jangan biarkan permintaan lolos ke server: itu berarti data nyata bisa
      // masuk ke gambar. Balas array kosong supaya UI menampilkan keadaan
      // kosong, bukan menunggu selamanya.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }

    stats.fulfilled += 1;
    return route.fulfill({
      status: response.status,
      contentType: response.contentType,
      body: JSON.stringify(response.json),
    });
  });

  return { stats: () => stats };
}

/**
 * Bekukan jam dinding di browser pada saat perekaman.
 *
 * Tanpa ini, label relatif ("3 hari yang lalu") dan rentang tanggal yang diminta
 * UI terus bergeser seiring waktu, sehingga gambar dokumentasi lama-lama
 * menampilkan tanggal yang tidak masuk akal.
 */
export async function installFrozenClock(page: Page, isoTime: string) {
  const frozen = new Date(isoTime).getTime();
  await page.addInitScript((frozenMs: number) => {
    const RealDate = Date;
    class FrozenDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(frozenMs);
        else super(...(args as []));
      }
      static now() {
        return frozenMs;
      }
    }
    // @ts-expect-error — mengganti Date global memang disengaja di konteks halaman.
    window.Date = FrozenDate;
  }, frozen);
}
