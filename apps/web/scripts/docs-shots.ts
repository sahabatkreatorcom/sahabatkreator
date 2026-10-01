/**
 * Daftar halaman yang diambil tangkapan layarnya untuk dokumentasi publik.
 *
 * Dipisah dari skrip pengambil gambar supaya dipakai bersama oleh:
 *   • scripts/docs-screenshots.ts   — pengambil gambar,
 *   • scripts/docs-fixtures.record.ts — perekam respons API untuk mode mockup.
 *
 * ⚠️ Menambah halaman di sini berarti halaman itu ikut direkam fixture-nya.
 *    Setelah mengubah daftar ini, rekam ulang fixture:
 *      DOCS_SHOT_EMAIL=... DOCS_SHOT_PASSWORD=... bun run docs:fixtures:record
 */

export type Shot = {
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

export const SHOTS: Shot[] = [
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
