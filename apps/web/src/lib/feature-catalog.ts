// Katalog fitur nyata aplikasi — dipakai admin /admin/plans (multi-select)
// dan halaman harga (render label dari plan.features yang berisi key katalog).
// Value = key yang disimpan di kolom plan.features (bukan teks bebas) agar
// tidak duplikat dengan limit numerik yang dirender otomatis dari field angka.

import type { FeatureKey } from "@sahabatkreator/db";

// Bertipe `Record<FeatureKey, …>` supaya katalog ini TIDAK BISA drift dari
// packages/db/src/feature-keys.ts: key yang kurang, berlebih, atau salah ketik
// langsung jadi error `tsc`. Urutan entri = urutan tampil di admin panel &
// halaman harga, jadi jangan diurutkan ulang tanpa alasan.
//
// Fitur global tanpa gate TIDAK masuk sini — katalog ini dipakai halaman harga
// untuk menggambar baris ✓/✗ per paket, jadi fitur yang tersedia untuk semua
// paket akan tampak seperti pembeda paket. Contoh: `holiday_ideas`.
const CATALOG: Record<FeatureKey, { label: string; hint: string }> = {
  multi_platform: {
    label: "Publish multi-platform",
    hint: "IG, FB, Threads, TikTok, YouTube, Pinterest, LinkedIn, Bluesky, GBP",
  },
  scheduling: {
    label: "Penjadwalan & antrian post",
    hint: "Kalender + antrian + retry otomatis",
  },
  story: { label: "Instagram Story", hint: "Publish story dengan rasio 9:16" },
  engagement_inbox: {
    label: "Inbox engagement",
    hint: "Komentar, mention, DM, review, collab",
  },
  ai_caption: {
    label: "AI caption & hashtag",
    hint: "Generate caption/rewrite/hashtag via kredit AI",
  },
  ai_coach: { label: "Coach AI mingguan", hint: "Analisa performa + saran strategi" },
  analytics: {
    label: "Analitik multi-akun",
    hint: "Reach, engagement, followers, waktu optimal",
  },
  analytics_compare: {
    label: "Analitik perbandingan periode",
    hint: "Dibanding periode sebelumnya",
  },
  reports_export: { label: "Laporan CSV & PDF", hint: "Export + jadwal email laporan" },
  media_library: { label: "Media library", hint: "Folder, import URL, alt text" },
  automation: {
    label: "Automation rules",
    hint: "Auto-reply & auto-like berdasarkan trigger",
  },
  listening: { label: "Social listening", hint: "Pantau kata kunci & brand mention" },
  competitors: { label: "Analisa kompetitor", hint: "Pantau akun kompetitor" },
  team: { label: "Tim & kolaborasi", hint: "Invite anggota dengan role" },
  products: { label: "Katalog produk", hint: "Tag produk di konten" },
  api_access: {
    label: "Akses Public API",
    hint: "Token creator untuk integrasi eksternal",
  },
  api_write: { label: "Public API tulis", hint: "Buat & jadwalkan konten lewat API" },
  api_webhook: {
    label: "Webhook keluar",
    // Jangan tulis "white-label / OAuth redirect domain sendiri" di sini —
    // belum ada implementasinya. redirectUri yang ada di kredensial platform
    // adalah milik app (diatur admin), bukan redirect per-org.
    hint: "Kirim event org ke endpoint HTTPS milik Anda sendiri",
  },
  priority_support: { label: "Support prioritas", hint: "Respons lebih cepat via WhatsApp" },
  onboarding_help: {
    label: "Onboarding & pelatihan",
    hint: "Panduan setup akun + tour fitur",
  },
};

export const FEATURE_CATALOG: { key: FeatureKey; label: string; hint: string }[] = (
  Object.keys(CATALOG) as FeatureKey[]
).map((key) => ({ key, ...CATALOG[key] }));

// Fitur yang berlaku untuk SEMUA paket tapi TIDAK bisa dihitung dari data plan,
// karena memang tidak pernah digerbang: tidak ada di `plan.features` dan tidak
// ada pemanggilan `checkPlanFeature` untuknya. Ditulis manual di sini supaya
// tetap terlihat di halaman harga (kartu "Semua paket dapat").
//
// MENGAPA `key` ada padahal tidak dipakai untuk lookup: supaya bisa diuji
// disjoint terhadap `FEATURE_KEYS` (packages/db). Kalau sebuah key ada di dua
// daftar, artinya fitur itu sebenarnya digerbang per paket tetapi diklaim
// gratis untuk semua paket — persis bug `holiday_ideas` yang dulu muncul ✓ di
// Gratis dan ✗ di tier berbayar. Dijaga apps/web/src/lib/feature-catalog.test.ts.
export const GLOBAL_FEATURES: { key: string; label: string; hint: string }[] = [
  {
    key: "holiday_ideas",
    label: "Ide Konten Hari Besar",
    hint: "Rekomendasi konten hari besar nasional & internasional + hashtag",
  },
  {
    key: "video_render",
    label: "Auto-clip & render video",
    hint: "Potong momen viral lalu render, dibatasi kredit render bulanan",
  },
  {
    key: "qris_payment",
    label: "Pembayaran QRIS & virtual account",
    hint: "Semua bank besar di Indonesia",
  },
];

/** Map key fitur → label marketing; fallback teks lama (data seed sebelum migrasi). */
export function featureLabel(key: string): string {
  return FEATURE_CATALOG.find((f) => f.key === key)?.label ?? key;
}
