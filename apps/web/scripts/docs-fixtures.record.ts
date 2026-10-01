/**
 * Merekam respons /api/** dari akun demo — bahan mentah untuk mode mockup.
 *
 * Hasilnya (`scripts/docs-fixtures/raw.json`) MASIH BERISI DATA NYATA, jadi
 * berkas itu gitignored dan hanya dipakai sebagai input
 * `docs-fixtures.sanitize.ts`. Yang di-commit hanyalah hasil sanitasinya.
 *
 * Cara pakai:
 *   DOCS_SHOT_EMAIL=... DOCS_SHOT_PASSWORD=... bun run docs:fixtures:record
 *
 * Perekaman hanya perlu diulang kalau daftar halaman berubah (scripts/docs-shots.ts)
 * atau ada halaman baru yang memanggil endpoint baru.
 *
 * ⚠️ Menghantam produksi: server membatasi /api/* ke 100 request / 60 detik per
 *    IP, jadi perekaman menahan laju sendiri. Tanpa itu, /api/me balas 429 dan
 *    halaman yang terekam adalah halaman login.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, type Page } from "playwright";
import { SHOTS } from "./docs-shots";

const BASE = process.env.DOCS_SHOT_BASE ?? "https://sahabatkreator.com";
const EMAIL = process.env.DOCS_SHOT_EMAIL ?? "";
const PASSWORD = process.env.DOCS_SHOT_PASSWORD ?? "";
const ONLY = process.env.DOCS_SHOT_ONLY ?? "";

const RATE_WINDOW_MS = 60_000;
const RATE_BUDGET = 60;
const SETTLE_MS = Number(process.env.DOCS_FIXTURE_SETTLE ?? "2500");

const OUT_DIR = path.resolve(import.meta.dirname, "docs-fixtures");
const OUT_FILE = path.join(OUT_DIR, "raw.json");

type Recorded = {
  status: number;
  contentType: string;
  /** JSON ter-parse bila memungkinkan, kalau tidak berupa string mentah. */
  json: unknown;
  /** Halaman yang memicunya — memudahkan penelusuran saat ada yang belum terekam. */
  seenOn: string[];
};

const recorded = new Map<string, Recorded>();
const apiHits: number[] = [];

function keyOf(method: string, url: string): string {
  const parsed = new URL(url);
  return `${method} ${parsed.pathname}${parsed.search}`;
}

function watchApiTraffic(page: Page, shotName: string) {
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    apiHits.push(Date.now());

    const key = keyOf(res.request().method(), url);
    void res
      .text()
      .then((body) => {
        let json: unknown = body;
        try {
          json = JSON.parse(body);
        } catch {
          // biarkan sebagai teks mentah
        }
        const existing = recorded.get(key);
        if (existing) {
          if (!existing.seenOn.includes(shotName)) existing.seenOn.push(shotName);
          return;
        }
        recorded.set(key, {
          status: res.status(),
          contentType: res.headers()["content-type"] ?? "application/json",
          json,
          seenOn: [shotName],
        });
      })
      .catch(() => {});
  });
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function waitForRateHeadroom(page: Page) {
  for (;;) {
    const now = Date.now();
    while (apiHits.length > 0 && now - (apiHits[0] as number) > RATE_WINDOW_MS) apiHits.shift();
    if (apiHits.length < RATE_BUDGET) return;
    const wait = RATE_WINDOW_MS - (now - (apiHits[0] as number)) + 400;
    console.log(
      `    … jeda ${Math.ceil(wait / 1000)}s (kuota API ${apiHits.length}/menit terpakai)`,
    );
    await page.waitForTimeout(Math.min(wait, 20_000));
  }
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("DOCS_SHOT_EMAIL dan DOCS_SHOT_PASSWORD wajib diisi.");
    process.exit(1);
  }

  const shots = SHOTS.filter((shot) => shot.auth && (!ONLY || shot.name.includes(ONLY)));
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    colorScheme: "light",
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  process.stdout.write("Masuk sebagai akun demo… ");
  await login(page);
  console.log("berhasil.");

  for (const shot of shots) {
    watchApiTraffic(page, shot.name);
    await waitForRateHeadroom(page);
    await page.goto(`${BASE}${shot.route}`, { waitUntil: "domcontentloaded" });
    if (shot.waitFor) {
      await page.waitForSelector(shot.waitFor, { timeout: 15_000 }).catch(() => {});
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    console.log(`  ✓ ${shot.name.padEnd(22)} (${recorded.size} respons terkumpul)`);

    // Simpan berkala supaya kegagalan di tengah jalan tidak membuang hasil.
    await writeFile(
      OUT_FILE,
      `${JSON.stringify(
        {
          base: BASE,
          recordedAt: new Date().toISOString(),
          responses: Object.fromEntries(recorded),
        },
        null,
        2,
      )}\n`,
    );
  }

  await browser.close();
  console.log(`\nSelesai: ${recorded.size} respons → ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(
    "Berkas ini berisi DATA NYATA — jangan di-commit. Lanjutkan dengan docs:fixtures:sanitize.",
  );
}

await main();
