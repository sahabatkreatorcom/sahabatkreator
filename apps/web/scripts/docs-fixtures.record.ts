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
 * Dua mode:
 *
 *   • bawaan       — cukup login, buka tiap halaman, terekam apa adanya. Hasilnya
 *                    di-MERGE dengan raw.json yang sudah ada, jadi halaman/tab
 *                    yang sudah pernah terekam tidak perlu dikunjungi lagi dan
 *                    endpoint baru ikut masuk tanpa membuang yang lama.
 *
 *   • DOCS_FIXTURE_PREP=1 — sebelum merekam, jalankan dulu
 *                    scripts/docs-fixtures.prep.ts: mengisi data contoh yang
 *                    hilang di akun demo (rule automation, monitor listening,
 *                    sumber web, lalu sync-nya). Tanpa ini halaman Automation &
 *                    Social Listening terekam dalam keadaan KOSONG, dan tangkapan
 *                    layarnya jadi tidak menjelaskan apa pun.
 *
 * ⚠️ Menghantam produksi: server membatasi /api/* ke 100 request / 60 detik per
 *    IP, jadi perekaman menahan laju sendiri. Tanpa itu, /api/me balas 429 dan
 *    halaman yang terekam adalah halaman login.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, type Page } from "playwright";
import { SHOTS } from "./docs-shots";

const BASE = process.env.DOCS_SHOT_BASE ?? "https://sahabatkreator.com";
const EMAIL = process.env.DOCS_SHOT_EMAIL ?? "";
const PASSWORD = process.env.DOCS_SHOT_PASSWORD ?? "";
const ONLY = process.env.DOCS_SHOT_ONLY ?? "";
const PREP = process.env.DOCS_FIXTURE_PREP === "1";

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

/**
 * Muat rekaman sebelumnya supaya perekaman ulang MENAMBAH, bukan menimpa.
 *
 * Tanpa ini, merekam satu halaman saja (`DOCS_SHOT_ONLY=automation`) akan
 * menghasilkan raw.json berisi 2 respons dan menghapus 51 respons lain —
 * fixtures.json berikutnya jadi jauh lebih kecil dan seluruh tangkapan layar
 * lain rusak.
 */
async function loadPrevious(): Promise<number> {
  try {
    const parsed = JSON.parse(await readFile(OUT_FILE, "utf8")) as {
      responses?: Record<string, Recorded>;
    };
    for (const [key, value] of Object.entries(parsed.responses ?? {})) recorded.set(key, value);
    return recorded.size;
  } catch {
    return 0;
  }
}

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

  const previous = await loadPrevious();
  if (previous > 0) console.log(`Rekaman sebelumnya: ${previous} respons (akan dipertahankan).`);

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

  if (PREP) {
    const { prepareDemoData } = await import("./docs-fixtures.prep");
    await prepareDemoData(page, BASE);
  }

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
  if (previous > 0) {
    console.log(`  (${previous} dari rekaman sebelumnya + ${recorded.size - previous} baru)`);
  }
  console.log(
    "Berkas ini berisi DATA NYATA — jangan di-commit. Lanjutkan dengan docs:fixtures:sanitize.",
  );
}

await main();
