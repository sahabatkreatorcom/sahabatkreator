// Katalog fitur nyata aplikasi — dipakai admin /admin/plans (multi-select)
// dan halaman harga (render label dari plan.features yang berisi key katalog).
// Value = key yang disimpan di kolom plan.features (bukan teks bebas) agar
// tidak duplikat dengan limit numerik yang dirender otomatis dari field angka.
export const FEATURE_CATALOG: { key: string; label: string; hint: string }[] = [
  {
    key: "multi_platform",
    label: "Publish multi-platform",
    hint: "IG, FB, Threads, TikTok, YouTube, Pinterest, LinkedIn, Bluesky, GBP",
  },
  {
    key: "scheduling",
    label: "Penjadwalan & antrian post",
    hint: "Kalender + antrian + retry otomatis",
  },
  { key: "story", label: "Instagram Story", hint: "Publish story dengan rasio 9:16" },
  {
    key: "engagement_inbox",
    label: "Inbox engagement",
    hint: "Komentar, mention, DM, review, collab",
  },
  {
    key: "ai_caption",
    label: "AI caption & hashtag",
    hint: "Generate caption/rewrite/hashtag via kredit AI",
  },
  { key: "ai_coach", label: "Coach AI mingguan", hint: "Analisa performa + saran strategi" },
  {
    key: "holiday_ideas",
    label: "Ide konten hari besar",
    hint: "Kalender hari besar Indonesia & internasional",
  },
  {
    key: "analytics",
    label: "Analitik multi-akun",
    hint: "Reach, engagement, followers, waktu optimal",
  },
  {
    key: "analytics_compare",
    label: "Analitik perbandingan periode",
    hint: "Dibanding periode sebelumnya",
  },
  { key: "reports_export", label: "Laporan CSV & PDF", hint: "Export + jadwal email laporan" },
  { key: "media_library", label: "Media library", hint: "Folder, import URL, alt text" },
  {
    key: "automation",
    label: "Automation rules",
    hint: "Auto-reply & auto-like berdasarkan trigger",
  },
  { key: "listening", label: "Social listening", hint: "Pantau kata kunci & brand mention" },
  { key: "competitors", label: "Analisa kompetitor", hint: "Pantau akun kompetitor" },
  { key: "team", label: "Tim & kolaborasi", hint: "Invite anggota dengan role" },
  { key: "products", label: "Katalog produk", hint: "Tag produk di konten" },
  { key: "api_access", label: "Akses Public API", hint: "Token creator untuk integrasi eksternal" },
  { key: "api_write", label: "Public API tulis", hint: "Buat & jadwalkan konten lewat API" },
  {
    key: "api_webhook",
    label: "Webhook keluar",
    // Jangan tulis "white-label / OAuth redirect domain sendiri" di sini —
    // belum ada implementasinya. redirectUri yang ada di kredensial platform
    // adalah milik app (diatur admin), bukan redirect per-org.
    hint: "Kirim event org ke endpoint HTTPS milik Anda sendiri",
  },
  { key: "priority_support", label: "Support prioritas", hint: "Respons lebih cepat via WhatsApp" },
  {
    key: "onboarding_help",
    label: "Onboarding & pelatihan",
    hint: "Panduan setup akun + tour fitur",
  },
];

/** Map key fitur → label marketing; fallback teks lama (data seed sebelum migrasi). */
export function featureLabel(key: string): string {
  return FEATURE_CATALOG.find((f) => f.key === key)?.label ?? key;
}
