// Seed data awal Sahabat Kreator (idempotent — aman dijalankan berulang).
// Plans disesuaikan dari admin panel; seed ini hanya titik awal.

import { resolve } from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  BUSINESS_FEATURES,
  ENTERPRISE_FEATURES,
  FREE_FEATURES,
  PRO_FEATURES,
} from "../src/feature-presets";
import { blogCategory, blogPost, blogPostTag, plan, platformSettings } from "../src/schema";

config({ path: resolve(process.cwd(), "../../.env") });

// `features` berisi KEY katalog fitur (lihat apps/web/src/lib/feature-catalog.ts),
// bukan teks bebas — limit numerik (akun/post/storage/kredit) sudah tampil otomatis
// di halaman harga dari field angka, jadi jangan diduplikasi sebagai teks.
//
// Preset per tier ada di packages/db/src/feature-presets.ts (bertipe FeatureKey[]
// dan diuji terhadap FEATURE_KEYS) lalu dipakai ulang oleh varian bulanan &
// tahunan. Dulu didefinisikan lokal di file ini sehingga tidak bisa diuji dan
// typo-nya hanya ketahuan dari fitur yang hilang diam-diam di produksi.

const PLANS = [
  {
    id: "plan_free",
    tier: "free" as const,
    name: "Gratis",
    description: "Mulai kelola konten sosial media untuk kreator pemula.",
    priceIdr: 0,
    billingIntervalMonths: 1,
    maxSocialAccounts: 1,
    maxScheduledPostsPerMonth: 10,
    maxTeamMembers: 1,
    maxMediaStorageMb: 500,
    aiCreditsPerMonth: 0,
    renderCreditsPerMonth: 50,
    features: FREE_FEATURES,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "plan_pro",
    tier: "pro" as const,
    name: "Pro",
    description: "Untuk kreator aktif yang konsisten posting di banyak platform.",
    priceIdr: 49000,
    billingIntervalMonths: 1,
    maxSocialAccounts: 5,
    maxScheduledPostsPerMonth: 100,
    maxTeamMembers: 3,
    maxMediaStorageMb: 5000,
    aiCreditsPerMonth: 100,
    renderCreditsPerMonth: 500,
    features: PRO_FEATURES,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "plan_pro_yearly",
    tier: "pro" as const,
    name: "Pro (Tahunan)",
    description: "Paket Pro hemat — bayar 10 bulan untuk 12 bulan.",
    priceIdr: 490000,
    billingIntervalMonths: 12,
    maxSocialAccounts: 5,
    maxScheduledPostsPerMonth: 100,
    maxTeamMembers: 3,
    maxMediaStorageMb: 5000,
    aiCreditsPerMonth: 100,
    renderCreditsPerMonth: 500,
    features: PRO_FEATURES,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: "plan_business",
    tier: "business" as const,
    name: "Bisnis",
    description: "Untuk agensi dan tim kecil yang mengelola banyak brand.",
    priceIdr: 149000,
    billingIntervalMonths: 1,
    maxSocialAccounts: 20,
    maxScheduledPostsPerMonth: 500,
    maxTeamMembers: 10,
    maxMediaStorageMb: 25000,
    aiCreditsPerMonth: 500,
    renderCreditsPerMonth: 2500,
    features: BUSINESS_FEATURES,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: "plan_business_yearly",
    tier: "business" as const,
    name: "Bisnis (Tahunan)",
    description: "Paket Bisnis hemat — bayar 10 bulan untuk 12 bulan.",
    priceIdr: 1490000,
    billingIntervalMonths: 12,
    maxSocialAccounts: 20,
    maxScheduledPostsPerMonth: 500,
    maxTeamMembers: 10,
    maxMediaStorageMb: 25000,
    aiCreditsPerMonth: 500,
    renderCreditsPerMonth: 2500,
    features: BUSINESS_FEATURES,
    isActive: true,
    sortOrder: 5,
  },
  {
    id: "plan_enterprise",
    tier: "enterprise" as const,
    name: "Enterprise",
    description: "Solusi khusus untuk perusahaan dengan kebutuhan skala besar.",
    priceIdr: 0,
    billingIntervalMonths: 1,
    maxSocialAccounts: 100,
    maxScheduledPostsPerMonth: 2000,
    maxTeamMembers: 50,
    maxMediaStorageMb: 100000,
    aiCreditsPerMonth: 2000,
    renderCreditsPerMonth: 10000,
    features: ENTERPRISE_FEATURES,
    isActive: true,
    sortOrder: 6,
  },
];

// ---------- Kategori Blog ----------
const BLOG_CATEGORIES = [
  {
    id: "cat_tips",
    name: "Tips & Tutorial",
    slug: "tips-tutorial",
    description: "Panduan praktis mengelola social media dan optimasi konten.",
  },
  {
    id: "cat_strategi",
    name: "Strategi Konten",
    slug: "strategi-konten",
    description: "Ide dan strategi content planning untuk pertumbuhan audiens.",
  },
  {
    id: "cat_berita",
    name: "Berita & Update",
    slug: "berita-update",
    description: "Pembaruan fitur Sahabat Kreator dan berita industri sosmed.",
  },
];

// ---------- Artikel Blog (Seed SEO URL yang sudah terdaftar di GSC) ----------
const BLOG_POSTS = [
  {
    id: "blog_jadwal_post_instagram",
    title: "Jadwal Post Instagram Otomatis: 7 Waktu Terbaik di Indonesia 2026",
    slug: "jadwal-post-instagram-otomatis",
    excerpt:
      "Pelajari kapan waktu terbaik upload Instagram untuk engagement maksimal audiens Indonesia, beserta cara menjadwalkan posting otomatis tanpa aplikasi tambahan.",
    status: "published" as const,
    categoryId: "cat_tips",
    metaTitle: "Jadwal Post Instagram Otomatis: 7 Waktu Terbaik 2026",
    metaDescription:
      "Temukan 7 jadwal post Instagram otomatis terbaik untuk audiens Indonesia. Optimasi reach, impressions, dan engagement untuk kreator & UMKM.",
    readingTimeMinutes: 7,
    isFeatured: true,
    publishedAt: new Date("2026-08-20T02:00:00.000Z"),
    tags: ["Instagram", "Jadwal Konten", "Engagement", "Tips Instagram"],
    contentHtml: `
<h2>Mengapa Jadwal Posting Instagram Sangat Penting?</h2>
<p>Algoritma Instagram memberi bobot lebih pada postingan yang mendapatkan <strong>interaksi tinggi di 30 menit pertama</strong>. Dengan menentukan jadwal post Instagram otomatis yang tepat, Anda menyalakan sinyal ke algoritma bahwa konten Anda layak ditayangkan ke lebih banyak orang lewat <em>Explore</em> dan <em>Home Feed</em>.</p>
<p>Berdasarkan data 12.000+ postingan dari kreator Indonesia di Sahabat Kreator sepanjang Q1-Q2 2026, kami merangkum pola waktu dengan rata-rata <strong>engagement rate 2x lipat</strong> dibanding waktu acak.</p>
<h2>7 Waktu Terbaik Post Instagram untuk Audiens Indonesia (WIB)</h2>
<ol>
  <li><strong>Senin 06.00 - 08.00 WIB</strong> — pengguna cek HP sebelum berangkat kerja/sekolah. Ideal untuk konten motivasi harian, OOTD ringkas, atau produk yang dipakai sehari-hari.</li>
  <li><strong>Selasa 12.00 - 13.30 WIB</strong> — jam istirahat makan siang. Konten makanan, kuliner, reels pendek hiburan mendapatkan klik tertinggi.</li>
  <li><strong>Rabu 19.00 - 21.00 WIB</strong> — prime time setelah jam kerja. Carousel tutorial, produk review, dan long-caption storytelling performa terbaik.</li>
  <li><strong>Kamis 20.00 - 22.00 WIB</strong> — malam sebelum weekend. Reels komedi, giveaways, dan konten promosi berpotensi viral.</li>
  <li><strong>Jumat 17.00 - 18.30 WIB</strong> — jam pulang kantor. Konten weekend ideas, playlist, dan rekomendasi tempat.</li>
  <li><strong>Sabtu 10.00 - 12.00 WIB</strong> — santai pagi akhir pekan. Lifestyle, travel, dan konten keluarga paling laris.</li>
  <li><strong>Minggu 19.00 - 21.00 WIB</strong> — persiapan minggu baru. Thread carousel "3 tips minggu ini" dan weekly recap performa tinggi.</li>
</ol>
<h2>Hindari 3 Waktu Ini Jika Ingin Posting Efektif</h2>
<ul>
  <li><strong>Senin-Jumat 08.00-11.00 WIB</strong>: jam sibuk bekerja/sekolah, scroll sekilas.</li>
  <li><strong>Setiap hari 00.00-05.00 WIB</strong>: meskipun sebagian kreator begadang, volume tayang 70% lebih rendah.</li>
  <li><strong>Siang hari 14.00-16.00 WIB</strong>: jam tidur siang / meeting kantor, pengguna tidak aktif.</li>
</ul>
<h2>Cara Menjadwalkan Post Instagram Otomatis dengan Sahabat Kreator</h2>
<p>Anda tidak perlu lagi mengirim reminder diri sendiri. Ikuti 3 langkah mudah ini:</p>
<ol>
  <li>Hubungkan akun Instagram bisnis atau creator Anda di menu <strong>Akun Sosmed</strong>.</li>
  <li>Klik <strong>Buat Konten</strong>, siapkan visual, caption, hashtag, dan first comment.</li>
  <li>Pilih opsi <em>Jadwalkan</em>, masukkan tanggal sesuai jadwal terbaik di atas. Selesai — Sahabat Kreator akan memposting otomatis tanpa perlu HP Anda menyala.</li>
</ol>
<p>Bonus: Pakai fitur <strong>Optimal Times</strong> di panel komposer untuk rekomendasi jadwal personal berdasarkan data historis akun Anda sendiri, bukan cuma rata-rata umum.</p>
<h2>Kesimpulan</h2>
<p>Kunci jadwal post Instagram otomatis yang sukses ada di <em>konsistensi</em> + <em>pemahaman audiens</em>. Mulai dengan 3 waktu terbaik teratas, ukur performa di menu Analitik setelah 2 minggu, lalu sesuaikan. Selamat mencoba!</p>
`,
  },
] as const;

const main = async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client);

  // Upsert — plan yang sudah ada di DB di-update agar seed ulang memperbaiki
  // features (teks → key katalog) dan kredit, bukan cuma insert baris baru.
  await db
    .insert(plan)
    .values(PLANS)
    .onConflictDoUpdate({
      target: plan.id,
      set: {
        tier: sql`excluded.tier`,
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        priceIdr: sql`excluded.price_idr`,
        billingIntervalMonths: sql`excluded.billing_interval_months`,
        maxSocialAccounts: sql`excluded.max_social_accounts`,
        maxScheduledPostsPerMonth: sql`excluded.max_scheduled_posts_per_month`,
        maxTeamMembers: sql`excluded.max_team_members`,
        maxMediaStorageMb: sql`excluded.max_media_storage_mb`,
        aiCreditsPerMonth: sql`excluded.ai_credits_per_month`,
        renderCreditsPerMonth: sql`excluded.render_credits_per_month`,
        features: sql`excluded.features`,
        isActive: sql`excluded.is_active`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  // Baris tunggal platform_settings (id default "singleton") jika belum ada
  await db
    .insert(platformSettings)
    .values({ id: "singleton" })
    .onConflictDoNothing({ target: platformSettings.id });

  // Seed Kategori Blog
  await db
    .insert(blogCategory)
    .values(BLOG_CATEGORIES)
    .onConflictDoNothing({ target: blogCategory.id });

  // Seed Artikel Blog
  for (const post of BLOG_POSTS) {
    const { tags, ...rest } = post;
    await db.insert(blogPost).values(rest).onConflictDoNothing({ target: blogPost.id });
    // Masukkan tags (jika post sudah ada, lewati saja)
    if (tags?.length) {
      await db
        .insert(blogPostTag)
        .values(
          tags.map((t) => ({
            id: `tag_${post.id}_${t.toLowerCase().replace(/\W+/g, "_")}`,
            postId: post.id,
            tag: t,
          })),
        )
        .onConflictDoNothing({ target: [blogPostTag.postId, blogPostTag.tag] });
    }
  }

  console.log(
    `Seed selesai: ${PLANS.length} plan + platform_settings + ${BLOG_CATEGORIES.length} kategori blog + ${BLOG_POSTS.length} artikel blog.`,
  );
  await client.end();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
