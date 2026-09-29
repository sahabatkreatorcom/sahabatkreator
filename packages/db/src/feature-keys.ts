// Daftar TUNGGAL key fitur paket.
//
// Sebelumnya daftar ini hidup di tiga tempat tanpa penjaga: `features` di
// scripts/seed.ts, `API_FEATURES` di apps/server, dan `FEATURE_CATALOG` di
// apps/web. Karena `plan.features` adalah array string bebas di DB, satu huruf
// salah ketik di admin panel (`api_wirte`) mengunci fitur untuk SEMUA tier —
// `checkPlanFeature` mencocokkan `includes()` persis, jadi tidak ada yang cocok
// dan tidak ada gejala apa pun di log.
//
// Penjaganya sekarang:
// - POST /admin/plans menolak key yang tidak ada di sini (400) → data buruk
//   tidak pernah masuk DB.
// - `API_FEATURES` & `FEATURE_CATALOG` dikunci ke tipe `FeatureKey` → salah
//   ketik jadi error `tsc`.
// - Test di apps/server memastikan preset per tier tetap subset dari daftar ini.
//
// Menambah fitur baru = tambah key di sini + entri label di
// apps/web/src/lib/feature-catalog.ts (di sana `Record<FeatureKey, …>` memaksa
// katalognya lengkap).
//
// Fitur GLOBAL — tersedia untuk semua paket dan tidak pernah dipanggil lewat
// `checkPlanFeature` — TIDAK boleh didaftarkan di sini. Kalau didaftarkan, ia
// ikut jadi baris ✓/✗ di halaman harga dan terlihat seolah bisa di-gate per
// paket. Contoh: `holiday_ideas` (ide konten hari besar) dulu ada di preset
// Free, sehingga halaman harga menampilkan ✓ di Gratis dan ✗ di tier berbayar —
// seolah naik paket menghilangkan fitur.
export const FEATURE_KEYS = [
  "multi_platform",
  "scheduling",
  "story",
  "engagement_inbox",
  "ai_caption",
  "ai_coach",
  "analytics",
  "analytics_compare",
  "reports_export",
  "media_library",
  "automation",
  "listening",
  "competitors",
  "team",
  "products",
  "api_access",
  "api_write",
  "api_webhook",
  "priority_support",
  "onboarding_help",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURE_KEYS);

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEY_SET.has(value);
}
