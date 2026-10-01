/**
 * Tangkapan layar untuk dokumentasi publik (public/docs/**).
 *
 * Semua gambar di dokumen /panduan dihasilkan oleh skrip ini supaya:
 *   • hasilnya konsisten (ukuran, zoom, tema),
 *   • bisa diperbarui sekaligus saat UI berubah,
 *   • tidak ada gambar "asal comot" yang basi.
 *
 * Cara pakai:
 *   DOCS_SHOT_EMAIL=... DOCS_SHOT_PASSWORD=... bun run docs:screenshots
 *
 * Variabel lingkungan:
 *   DOCS_SHOT_BASE      default https://sahabatkreator.com
 *   DOCS_SHOT_EMAIL     akun demo (organisasi berisi data contoh)
 *   DOCS_SHOT_PASSWORD  password akun demo
 *   DOCS_SHOT_ONLY      filter nama shot, mis. "kalender" (opsional)
 *   DOCS_SHOT_ZOOM      default 1.3 — sama dengan zoom 130% di browser
 *   DOCS_SHOT_HEADFUL   "1" untuk melihat prosesnya
 *
 * ⚠️ Akun yang dipakai harus berisi DATA CONTOH, karena hasilnya dipublikasikan
 *    di situs. Jangan pakai akun pelanggan sungguhan.
 */
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, type Page } from "playwright";
import sharp from "sharp";

const BASE = process.env.DOCS_SHOT_BASE ?? "https://sahabatkreator.com";
const EMAIL = process.env.DOCS_SHOT_EMAIL ?? "";
const PASSWORD = process.env.DOCS_SHOT_PASSWORD ?? "";
const ONLY = process.env.DOCS_SHOT_ONLY ?? "";
const ZOOM = Number(process.env.DOCS_SHOT_ZOOM ?? "1.3");
const HEADFUL = process.env.DOCS_SHOT_HEADFUL === "1";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "public", "docs");

type Shot = {
  /** Nama berkas tanpa ekstensi, mis. "kalender" */
  name: string;
  /** Subfolder: "panduan" atau "developers" */
  group: "panduan" | "developers";
  /** Path relatif dari BASE */
  route: string;
  /** Butuh login? */
  auth?: boolean;
  /** Tangkap seluruh tinggi halaman, bukan hanya viewport */
  fullPage?: boolean;
  /** Tunggu elemen ini muncul sebelum menangkap (selector CSS) */
  waitFor?: string;
  /** Nama tampilan untuk log */
  label: string;
};

const SHOTS: Shot[] = [
  // ---------- Panduan: bagian umum ----------
  {
    name: "dashboard",
    group: "panduan",
    route: "/dashboard",
    auth: true,
    label: "Dashboard utama",
  },
  {
    name: "accounts",
    group: "panduan",
    route: "/accounts",
    auth: true,
    label: "Halaman Akun — daftar akun sosial terhubung",
  },
  {
    name: "compose",
    group: "panduan",
    route: "/compose",
    auth: true,
    label: "Editor konten",
  },
  {
    name: "calendar",
    group: "panduan",
    route: "/calendar",
    auth: true,
    label: "Kalender konten",
  },
  {
    name: "queue",
    group: "panduan",
    route: "/queue",
    auth: true,
    label: "Antrean penerbitan",
  },
  {
    name: "post-results",
    group: "panduan",
    route: "/post-results",
    auth: true,
    label: "Hasil posting",
  },
  {
    name: "inbox",
    group: "panduan",
    route: "/inbox",
    auth: true,
    label: "Inbox komentar & DM",
  },
  {
    name: "engagement",
    group: "panduan",
    route: "/engagement",
    auth: true,
    label: "Engagement",
  },
  {
    name: "analitik",
    group: "panduan",
    route: "/performance/analitik",
    auth: true,
    label: "Analitik",
  },
  {
    name: "laporan",
    group: "panduan",
    route: "/performance/laporan",
    auth: true,
    label: "Laporan",
  },
  {
    name: "media",
    group: "panduan",
    route: "/media",
    auth: true,
    label: "Pustaka media",
  },
  {
    name: "generator-carousel",
    group: "panduan",
    route: "/generator/carousel",
    auth: true,
    label: "Generator carousel",
  },
  {
    name: "generator-repurpose",
    group: "panduan",
    route: "/generator/repurpose",
    auth: true,
    label: "Repurpose konten",
  },
  {
    name: "video",
    group: "panduan",
    route: "/video",
    auth: true,
    label: "Render video",
  },
  {
    name: "auto-clip",
    group: "panduan",
    route: "/auto-clip",
    auth: true,
    label: "Auto-clip",
  },
  {
    name: "automation",
    group: "panduan",
    route: "/automation",
    auth: true,
    label: "Automation",
  },
  {
    name: "riset-tren",
    group: "panduan",
    route: "/research/tren",
    auth: true,
    label: "Riset tren",
  },
  {
    name: "riset-listening",
    group: "panduan",
    route: "/research/listening",
    auth: true,
    label: "Social listening",
  },
  {
    name: "asisten-coach",
    group: "panduan",
    route: "/assistant/coach",
    auth: true,
    label: "Asisten AI — Coach",
  },
  {
    name: "tim",
    group: "panduan",
    route: "/team",
    auth: true,
    label: "Tim & anggota",
  },
  {
    name: "langganan",
    group: "panduan",
    route: "/settings/billing",
    auth: true,
    label: "Langganan & tagihan",
  },
  {
    name: "pengaturan-api",
    group: "panduan",
    route: "/settings",
    auth: true,
    label: "Pengaturan",
  },

  // ---------- Developers: halaman publik, tanpa login ----------
  {
    name: "referensi-api",
    group: "developers",
    route: "/v1/docs",
    label: "Referensi API interaktif (Scalar)",
  },
];

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

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error(
      "DOCS_SHOT_EMAIL dan DOCS_SHOT_PASSWORD wajib diisi.\n" +
        "Contoh:\n  DOCS_SHOT_EMAIL=demo@example.com DOCS_SHOT_PASSWORD=... bun run docs:screenshots",
    );
    process.exit(1);
  }

  const shots = ONLY
    ? SHOTS.filter((shot) => shot.name.includes(ONLY) || shot.label.toLowerCase().includes(ONLY))
    : SHOTS;

  if (shots.length === 0) {
    console.error(`Tidak ada shot yang cocok dengan filter "${ONLY}".`);
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
  });
  const page = await context.newPage();

  await mkdir(path.join(OUT_DIR, "panduan"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "developers"), { recursive: true });

  if (shots.some((shot) => shot.auth)) {
    process.stdout.write("Masuk sebagai akun demo… ");
    await login(page);
    console.log("berhasil.");
  }

  let ok = 0;
  for (const shot of shots) {
    const target = path.join(OUT_DIR, shot.group, `${shot.name}.webp`);
    try {
      await page.goto(`${BASE}${shot.route}`, { waitUntil: "domcontentloaded" });
      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 15_000 }).catch(() => {});
      }
      await settle(page);
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

      const { size } = await stat(target);
      const kb = Math.round(size / 1024);
      console.log(`  ✓ ${shot.group}/${shot.name}.webp (${kb} KB) — ${shot.label}`);
      ok += 1;
    } catch (error) {
      console.error(`  ✗ ${shot.group}/${shot.name}.webp — ${shot.label}`);
      console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await browser.close();
  console.log(`\nSelesai: ${ok}/${shots.length} gambar tersimpan di public/docs/.`);
  if (ok < shots.length) process.exitCode = 1;
}

await main();
