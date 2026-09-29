// Logic perbandingan paket — dipakai halaman /harga (tabel desktop + kartu mobile).
import type { FeatureKey } from "@sahabatkreator/db";
import { FEATURE_CATALOG, featureLabel } from "@/lib/feature-catalog";
import { formatCurrencyIdr, formatNumber } from "@/lib/format";

export type Plan = {
  id: string;
  tier: string;
  name: string;
  description: string | null;
  priceIdr: number;
  billingIntervalMonths: number;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  aiCreditsPerMonth: number;
  renderCreditsPerMonth: number;
  features: string[] | null;
};

export const TIER_ORDER = ["free", "pro", "business", "enterprise"] as const;
export const TIER_LABEL: Record<string, string> = {
  free: "Gratis",
  pro: "Pro",
  business: "Bisnis",
  enterprise: "Enterprise",
};
export const HIGHLIGHT_TIER = "pro";
/** Nilai limit >= ini ditampilkan sebagai ∞ (unlimited) — konvensi admin /admin/plans. */
export const UNLIMITED_MIN = 9999;

export type Cell = { kind: "text"; text: string } | { kind: "check" } | { kind: "cross" };

export const CHECK_CELL: Cell = { kind: "check" };
export const CROSS_CELL: Cell = { kind: "cross" };

export const text = (value: string): Cell => ({ kind: "text", text: value });

export function limitCell(value: number, format: (n: number) => string = formatNumber): Cell {
  if (value <= 0) return CROSS_CELL;
  if (value >= UNLIMITED_MIN) return text("∞");
  return text(format(value));
}

export function storageCell(mb: number): Cell {
  if (mb <= 0) return CROSS_CELL;
  if (mb >= UNLIMITED_MIN) return text("∞");
  return text(mb >= 1024 ? `${formatNumber(Math.round(mb / 1024))} GB` : `${mb} MB`);
}

export type Row = { label: string; cells: (plans: Plan[]) => Cell[] };

export const SECTION_LIMITS = "Limit Inti";
export const SECTION_CREDITS = "Kredit Bulanan";
export const SECTION_FEATURES = "Fitur";

export const LIMIT_ROWS: Row[] = [
  { label: "Akun sosial media", cells: (ps) => ps.map((p) => limitCell(p.maxSocialAccounts)) },
  {
    label: "Post terjadwal / bulan",
    cells: (ps) => ps.map((p) => limitCell(p.maxScheduledPostsPerMonth)),
  },
  { label: "Anggota tim", cells: (ps) => ps.map((p) => limitCell(p.maxTeamMembers)) },
  { label: "Penyimpanan media", cells: (ps) => ps.map((p) => storageCell(p.maxMediaStorageMb)) },
];

export const CREDIT_ROWS: Row[] = [
  { label: "Kredit AI / bulan", cells: (ps) => ps.map((p) => limitCell(p.aiCreditsPerMonth)) },
  {
    label: "Kredit render / bulan",
    cells: (ps) => ps.map((p) => limitCell(p.renderCreditsPerMonth)),
  },
];

/**
 * Key katalog yang dimiliki SEMUA paket → tidak membedakan paket apa pun, jadi
 * dirender di kartu "Semua paket dapat" di atas tabel, bukan sebagai baris
 * perbandingan.
 *
 * MENGAPA dihitung dari data plan, bukan daftar hard-code: admin bisa mengubah
 * `plan.features` kapan saja di /admin/plans. Kalau daftarnya statis, tabel dan
 * kartu bisa saling bertentangan (fitur tampil di kartu "semua paket dapat"
 * padahal ada paket yang tidak memilikinya). Dengan cara ini baris berpindah
 * kartu otomatis.
 *
 * Mengembalikan [] untuk input kosong — penting supaya `every()` pada array
 * kosong (yang selalu true) tidak membuat SEMUA fitur diklaim milik semua paket
 * saat data plan belum termuat.
 */
export function sharedFeatureKeys(featureSource: Plan[]): FeatureKey[] {
  if (featureSource.length === 0) return [];
  return FEATURE_CATALOG.filter((f) =>
    featureSource.every((p) => (p.features ?? []).includes(f.key)),
  ).map((f) => f.key);
}

/**
 * Baris fitur — pakai features plan bulanan tier (plan tahunan hanya beda harga).
 * `exclude` membuang baris yang sudah tampil di kartu "Semua paket dapat"
 * (lihat `sharedFeatureKeys`) agar tidak muncul dua kali di halaman yang sama.
 */
export function featureRows(featureSource: Plan[], exclude: FeatureKey[] = []): Row[] {
  const skip = new Set<string>(exclude);
  return FEATURE_CATALOG.filter((f) => !skip.has(f.key)).map((f) => ({
    label: featureLabel(f.key),
    cells: (plans: Plan[]) =>
      plans.map((p, i) =>
        (featureSource[i]?.features ?? p.features ?? []).includes(f.key) ? CHECK_CELL : CROSS_CELL,
      ),
  }));
}

export function priceLabel(p: Plan): string {
  if (p.tier === "enterprise") return "Hubungi kami";
  if (p.priceIdr === 0) return "Rp0";
  return formatCurrencyIdr(p.priceIdr);
}

export function priceSuffix(p: Plan, interval: 1 | 12): string {
  if (p.priceIdr <= 0) return "";
  return interval === 12 ? " /tahun" : " /bulan";
}

/**
 * Penghematan paket tahunan vs 12× harga bulanan → label marketing:
 * "Hemat Rp98.000 (2 bulan gratis)" atau versi persen bila tidak bulat.
 * null bila bukan tahunan / tidak ada selisih.
 */
export function annualSavings(yearly: Plan | undefined, monthly: Plan | undefined): string | null {
  if (!yearly || !monthly) return null;
  if (yearly.billingIntervalMonths !== 12 || monthly.priceIdr <= 0) return null;
  const full = monthly.priceIdr * 12;
  const save = full - yearly.priceIdr;
  if (save <= 0) return null;
  const months = save / monthly.priceIdr;
  const percent = Math.round((save / full) * 100);
  if (months >= 1 && Math.abs(months - Math.round(months)) < 0.05) {
    return `Hemat ${formatCurrencyIdr(save)} (${Math.round(months)} bulan gratis)`;
  }
  return `Hemat ${formatCurrencyIdr(save)} (${percent}% dari harga bulanan)`;
}

export function ctaFor(tier: string): { label: string; to: string } {
  if (tier === "enterprise") return { label: "Hubungi Kami", to: "/kontak" };
  if (tier === "free") return { label: "Mulai Gratis", to: "/register" };
  return { label: `Pilih ${TIER_LABEL[tier] ?? tier}`, to: "/register" };
}

/**
 * Label badge pada toggle interval tahunan di /harga.
 *
 * TIDAK boleh hard-code "Hemat 2 bulan": harga plan editable admin, dan badge
 * yang menyesatkan lebih buruk daripada tidak ada. null = jangan tampilkan
 * badge sama sekali (tidak ada tier tahunan yang benar-benar lebih murah).
 * Bulan gratis dihitung per tier; jika bulat & seragam → "Hemat N bulan",
 * jika berbeda antar tier → "Hemat hingga N bulan", jika tidak bulat →
 * label generik tanpa angka.
 */
export function annualToggleLabel(tiers: { plan: Plan; monthly: Plan }[]): string | null {
  let anySavings = false;
  let maxMonths = 0;
  for (const { plan, monthly } of tiers) {
    if (!annualSavings(plan, monthly)) continue;
    anySavings = true;
    if (monthly.priceIdr > 0) {
      const months = (monthly.priceIdr * 12 - plan.priceIdr) / monthly.priceIdr;
      if (plan.billingIntervalMonths === 12 && Number.isInteger(months)) {
        maxMonths = Math.max(maxMonths, months);
      }
    }
  }
  if (!anySavings) return null;
  if (maxMonths <= 0) return "Hemat dengan paket tahunan";
  return maxMonths === 1 ? "Hemat 1 bulan" : `Hemat hingga ${maxMonths} bulan`;
}
