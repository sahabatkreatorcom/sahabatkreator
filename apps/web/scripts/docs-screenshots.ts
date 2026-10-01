/**
 * Tangkapan layar untuk dokumentasi publik (public/docs/**).
 *
 * Semua gambar di dokumen /panduan dan /developers dihasilkan oleh skrip ini
 * supaya hasilnya konsisten (ukuran, zoom, tema) dan bisa diperbarui sekaligus
 * saat UI berubah.
 *
 * Dua mode:
 *
 *   • mock (bawaan) — seluruh permintaan /api/** dipenuhi dari fixture fiktif
 *     (scripts/docs-fixtures/fixtures.json). UI tetap aplikasi sungguhan, tapi
 *     tidak ada nama, handle, foto, isi DM, atau email siapa pun yang tampil.
 *     Tidak perlu akun, tidak menyentuh API server, hasilnya deterministik, dan
 *     bisa dijalankan di CI.
 *
 *   • live — login ke akun demo lalu ambil apa adanya. Dipakai hanya untuk
 *     merekam fixture (lihat docs-fixtures.record.ts), bukan untuk menerbitkan
 *     gambar.
 *
 * Cara pakai:
 *   bun run docs:screenshots                       # mode mock
 *   DOCS_SHOT_MODE=live DOCS_SHOT_EMAIL=... DOCS_SHOT_PASSWORD=... bun run docs:screenshots
 *
 * Variabel lingkungan:
 *   DOCS_SHOT_MODE      "mock" (bawaan) atau "live"
 *   DOCS_SHOT_BASE      default https://sahabatkreator.com
 *   DOCS_SHOT_EMAIL     akun demo (hanya mode live)
 *   DOCS_SHOT_PASSWORD  password akun demo (hanya mode live)
 *   DOCS_SHOT_ONLY      filter nama shot, mis. "kalender" (opsional)
 *   DOCS_SHOT_ZOOM      default 1.3 — sama dengan zoom 130% di browser
 *   DOCS_SHOT_HEADFUL   "1" untuk melihat prosesnya
 *   DOCS_SHOT_GAP       jeda antar-halaman dalam ms (default 900)
 *
 * ⚠️ Mode live menghantam server produksi. Server membatasi /api/* ke 100
 *    request / 60 detik per IP (apps/server/src/lib/rate-limit.ts). Bila kuota
 *    itu lewat, /api/me balas 429 → RequireAuth melempar browser ke /login, dan
 *    tanpa penjagaan di bawah halaman login itu ikut tersimpan sebagai
 *    "tangkapan layar dashboard". Karena itu skrip ini: (1) menahan laju
 *    sebelum kuota habis, (2) MENOLAK menyimpan gambar yang ternyata halaman
 *    login atau halaman kosong, (3) login ulang lalu mengulang shot itu.
 */
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { installFixtures, installFrozenClock, loadFixtures } from "./docs-fixtures";
import { SHOTS, type Shot } from "./docs-shots";

const MODE = (process.env.DOCS_SHOT_MODE ?? "mock") as "mock" | "live";
const BASE = process.env.DOCS_SHOT_BASE ?? "https://sahabatkreator.com";
const EMAIL = process.env.DOCS_SHOT_EMAIL ?? "";
const PASSWORD = process.env.DOCS_SHOT_PASSWORD ?? "";
const ONLY = process.env.DOCS_SHOT_ONLY ?? "";
const ZOOM = Number(process.env.DOCS_SHOT_ZOOM ?? "1.3");
const HEADFUL = process.env.DOCS_SHOT_HEADFUL === "1";
const GAP_MS = Number(process.env.DOCS_SHOT_GAP ?? "900");

/** Batas kuota /api/* di server: 100 request / 60 detik per IP. Kita sisakan
 *  margin karena halaman yang sedang terbuka masih memanggil API sendiri. */
const RATE_WINDOW_MS = 60_000;
const RATE_BUDGET = 60;
/** Berapa kali shot diulang bila ternyata tertangkap halaman login/kosong. */
const MAX_ATTEMPTS = 3;
/** Halaman dengan teks sesedikit ini dianggap gagal render. */
const MIN_BODY_TEXT = 120;

const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "docs");

async function applyZoom(page: Page) {
  // Meniru zoom 130% di browser: seluruh UI diperbesar agar teks tetap terbaca
  // setelah gambar diperkecil di halaman dokumentasi.
  if (ZOOM === 1) return;
  await page.addStyleTag({ content: `html { zoom: ${ZOOM}; }` });
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

async function settle(page: Page) {
  // Beri waktu data dari API ter-render, lalu matikan animasi agar hasilnya tajam.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none !important;transition:none !important;}",
  });
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------------------
// Penjaga kuota API (hanya relevan di mode live)
// ---------------------------------------------------------------------------
const apiHits: number[] = [];

function watchApiTraffic(page: Page) {
  page.on("response", (res) => {
    if (res.url().includes("/api/")) apiHits.push(Date.now());
  });
}

/**
 * Tunggu sampai kuota API punya ruang lagi. Dipanggil SEBELUM tiap halaman
 * supaya kita tidak pernah menabrak limit di tengah render — menabrak limit
 * bukan cuma bikin shot gagal, tapi juga melempar sesi ke halaman login.
 */
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

// ---------------------------------------------------------------------------
// Penjagaan isi gambar
// ---------------------------------------------------------------------------
/** Halaman login = shot tidak sah. Dikenali dari URL dan form password. */
async function isLoginPage(page: Page): Promise<boolean> {
  if (new URL(page.url()).pathname.startsWith("/login")) return true;
  return (await page.$("#password")) !== null;
}

async function bodyTextLength(page: Page): Promise<number> {
  return page.evaluate(() => document.body.innerText.trim().length);
}

/**
 * Ambil satu shot. Melempar error bila halaman ber-auth justru mendarat di
 * /login atau tidak merender apa pun — lebih baik gagal terang-terangan
 * daripada menaruh gambar yang salah ke dalam dokumentasi publik.
 */
async function capture(page: Page, shot: Shot, target: string) {
  await page.goto(`${BASE}${shot.route}`, { waitUntil: "domcontentloaded" });
  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: 15_000 }).catch(() => {});
  }
  await settle(page);

  if (shot.auth && (await isLoginPage(page))) {
    throw new Error("terlempar ke halaman login (kuota API / sesi / fixture tidak terpasang)");
  }

  const textLength = await bodyTextLength(page);
  if (textLength < MIN_BODY_TEXT) {
    throw new Error(`halaman hampir kosong (${textLength} karakter teks)`);
  }

  await applyZoom(page);
  await page.waitForTimeout(250);

  // Tangkap ke memori lalu enkode ulang ke WebP. PNG dari layar 2× bisa
  // 300–500 KB per gambar; WebP memangkasnya ~70% tanpa perbedaan yang
  // terlihat, dan itu penting karena gambar ini diunduh pengunjung biasa.
  const png = await page.screenshot({
    fullPage: shot.fullPage ?? false,
    animations: "disabled",
  });
  await sharp(png).webp({ quality: 82, effort: 5 }).toFile(target);
}

async function main() {
  const shots = ONLY
    ? SHOTS.filter((shot) => shot.name.includes(ONLY) || shot.label.toLowerCase().includes(ONLY))
    : SHOTS;

  if (shots.length === 0) {
    console.error(`Tidak ada shot yang cocok dengan filter "${ONLY}".`);
    process.exit(1);
  }

  const needsAuth = shots.some((shot) => shot.auth);
  if (MODE === "live" && needsAuth && (!EMAIL || !PASSWORD)) {
    console.error(
      "DOCS_SHOT_EMAIL dan DOCS_SHOT_PASSWORD wajib diisi untuk shot yang butuh login.\n" +
        "Contoh:\n  DOCS_SHOT_MODE=live DOCS_SHOT_EMAIL=demo@example.com DOCS_SHOT_PASSWORD=... bun run docs:screenshots",
    );
    process.exit(1);
  }

  const fixtures = MODE === "mock" ? loadFixtures() : null;
  if (MODE === "mock" && !fixtures) {
    console.error(
      "Fixture belum ada. Jalankan dulu:\n" +
        "  DOCS_SHOT_EMAIL=... DOCS_SHOT_PASSWORD=... bun run docs:fixtures:record\n" +
        "  bun run docs:fixtures:sanitize",
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({
    // deviceScaleFactor 2 → gambar tetap tajam saat ditampilkan di layar Retina.
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    // Tema terang: paling aman untuk dibaca di semua perangkat.
    colorScheme: "light",
    // Service worker menyajikan shell SPA untuk navigasi — kalau dibiarkan,
    // halaman yang dilayani server (mis. /v1/docs milik Scalar) tertangkap
    // sebagai halaman 404 milik React Router.
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  await mkdir(path.join(OUT_DIR, "panduan"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "developers"), { recursive: true });

  let fixtureStats: { stats: () => { fulfilled: number; missed: string[] } } | null = null;

  if (MODE === "mock" && fixtures) {
    // Jam dibekukan pada saat perekaman supaya label relatif ("3 hari yang lalu")
    // dan rentang tanggal tidak bergeser seiring waktu.
    await installFrozenClock(page, fixtures.recordedAt);
    fixtureStats = installFixtures(page, fixtures);
    console.log(`Mode mockup — fixture direkam ${fixtures.recordedAt}, tanpa login.`);
  } else if (needsAuth) {
    watchApiTraffic(page);
    process.stdout.write("Masuk sebagai akun demo… ");
    await login(page);
    console.log("berhasil.");
  }

  let ok = 0;
  const failed: string[] = [];

  for (const shot of shots) {
    const target = path.join(OUT_DIR, shot.group, `${shot.name}.webp`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        if (MODE === "live") await waitForRateHeadroom(page);
        await capture(page, shot, target);

        const { size } = await stat(target);
        const kb = Math.round(size / 1024);
        console.log(`  ✓ ${shot.group}/${shot.name}.webp (${kb} KB) — ${shot.label}`);
        ok += 1;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt === MAX_ATTEMPTS) {
          console.error(`  ✗ ${shot.group}/${shot.name}.webp — ${shot.label}`);
          console.error(`    ${message}`);
          failed.push(`${shot.group}/${shot.name}`);
          break;
        }

        console.log(
          `    ⟳ ${shot.name}: ${message} — jeda, login ulang, ulangi (${attempt}/${MAX_ATTEMPTS - 1})`,
        );
        // Beri jendela rate-limit waktu untuk menggelinding, lalu pulihkan sesi.
        await page.waitForTimeout(20_000);
        if (MODE === "live" && needsAuth) await login(page);
      }
    }

    await page.waitForTimeout(GAP_MS);
  }

  await browser.close();
  console.log(`\nSelesai: ${ok}/${shots.length} gambar tersimpan di public/docs/.`);

  if (fixtureStats) {
    const { fulfilled, missed } = fixtureStats.stats();
    console.log(`Fixture terpakai: ${fulfilled} permintaan.`);
    if (missed.length > 0) {
      console.warn(`⚠ ${missed.length} permintaan tidak punya fixture (dibalas array kosong):`);
      for (const key of missed) console.warn(`    ${key}`);
    }
  }

  if (failed.length > 0) {
    console.error(`Gagal: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

await main();
