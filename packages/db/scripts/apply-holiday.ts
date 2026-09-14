// Migrasi + seed tabel holiday — kalender hari besar Indonesia & internasional
// Jalankan: bun packages/db/scripts/apply-holiday.ts
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL tidak diset");
  process.exit(1);
}

type HolidaySeed = {
  name: string;
  description: string;
  month: number;
  day: number;
  scope: "national" | "international";
  category: string;
  ideaTemplates: { angle: string; example: string }[];
  suggestedHashtags: string[];
};

const HOLIDAYS: HolidaySeed[] = [
  // ================= JANUARI =================
  {
    name: "Tahun Baru",
    description: "Awal tahun kalender — momentum resolusi & promo awal tahun.",
    month: 1,
    day: 1,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Refleksi & resolusi",
        example: '"5 pelajaran bisnis saya di tahun lalu" — cerita jujur membangun relasi',
      },
      {
        angle: "Promo awal tahun",
        example: "Diskon 'New Year Sale' untuk produk terpilih, deadline jelas",
      },
      { angle: "Engagement", example: "Polling: apa target followers tahun ini? Berikan support" },
    ],
    suggestedHashtags: ["TahunBaru", "Resolusi2026", "NewYearNewGoals"],
  },
  // ================= FEBRUARI =================
  {
    name: "Hari Valentine",
    description: "Momentum cinta & promo hadiah — traffic belanja tinggi.",
    month: 2,
    day: 14,
    scope: "international",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Promo hadiah",
        example: "Bundling produk 'Gift for Him/Her' dengan kemasan spesial",
      },
      {
        angle: "Konten emosional",
        example: "Cerita pasangan pelanggan setiamu — user generated content",
      },
      { angle: "Educational", example: "Tips memilih hadiah sesuai love language" },
    ],
    suggestedHashtags: ["ValentinesDay", "ValentineGift", "HappyValentines"],
  },
  {
    name: "Imlek (estimasi — sesuaikan kalender)",
    description: "Tahun Baru Imlek — tanggal mengikuti kalender lunar tiap tahun.",
    month: 2,
    day: 17,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      { angle: "Promo Imlek", example: "Diskon bertema merah-emas, angka hoki 8 (28%, 88rb)" },
      {
        angle: "Konten budaya",
        example: "Share makna kue keranjang / bersih-bersih rumah sebelum Imlek",
      },
    ],
    suggestedHashtags: ["Imlek", "GongXiFaCai", "ChineseNewYear"],
  },
  {
    name: "Awal Ramadhan (estimasi — sesuaikan kalender Hijriah)",
    description: "Tanggal mengikuti kalender Hijriah — sesuaikan tiap tahun (2026: ~19 Feb).",
    month: 2,
    day: 19,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      { angle: "Konten ramadhan", example: "Jadwal imsak + menu sahur featuring produk kulinermu" },
      {
        angle: "Promo ramadhan",
        example: "Diskon berkurang tiap minggu (early bird) sampai lebaran",
      },
    ],
    suggestedHashtags: ["Ramadhan", "RamadanKareem", "SahurTime"],
  },
  {
    name: "Hari Peduli Sampah Nasional",
    description: "Kesadaran lingkungan — cocok untuk brand dengan nilai sustainability.",
    month: 2,
    day: 21,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      { angle: "Kampanye hijau", example: "Tunjukkan upaya reduce-reuse brand kamu" },
      { angle: "Edukasi", example: "Cara memilah sampah rumah tangga dengan benar" },
    ],
    suggestedHashtags: ["PeduliSampah", "ZeroWaste", "SustainableLiving"],
  },
  // ================= MARET =================
  {
    name: "Hari Konsumen Nasional",
    description: "Hak konsumen — momentum membangun kepercayaan & transparansi.",
    month: 3,
    day: 4,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      { angle: "Transparansi", example: "Bocoran bahan baku, harga, atau proses produksi jujur" },
      {
        angle: "Edukasi hak",
        example: "Tips berbelanja online aman — posisikan brand sebagai teman",
      },
    ],
    suggestedHashtags: ["HariKonsumenNasional", "KonsumenCerdas"],
  },
  {
    name: "Hari Perempuan Internasional",
    description: "Apresiasi perempuan — kuat untuk brand yang dipimpin/didominasi perempuan.",
    month: 3,
    day: 8,
    scope: "international",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Kisah inspiratif",
        example: "Fitur perempuan di balik brand: founder, tim, atau pelanggan",
      },
      {
        angle: "Promo khusus",
        example: "Diskon untuk pelanggan perempuan atau donasi ke kewanitaan",
      },
    ],
    suggestedHashtags: ["InternationalWomensDay", "HariPerempuanSedunia", "WomenEmpowerment"],
  },
  {
    name: "Idul Fitri / Lebaran (estimasi — sesuaikan kalender Hijriah)",
    description: "Tanggal mengikuti kalender Hijriah — sesuaikan tiap tahun (2026: ~20 Mar).",
    month: 3,
    day: 20,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Konten THR & homecoming",
        example: "Gift guide dengan budget THR — dari yang murah sampai premium",
      },
      {
        angle: "Ucapan",
        example: "Video ucapan 'Selamat Idul Fitri, Mohon Maaf Lahir & Batin' dari tim",
      },
      { angle: "Promo pre-order", example: "PO hampers lebaran dengan deadline pengiriman jelas" },
    ],
    suggestedHashtags: ["IdulFitri", "SelamatIdulFitri", "Lebaran", "THR2026"],
  },
  {
    name: "Hari Air Sedunia",
    description: "Konservasi air — cocok untuk brand F&B atau lingkungan.",
    month: 3,
    day: 22,
    scope: "international",
    category: "umum",
    ideaTemplates: [
      { angle: "Kampanye hemat air", example: "Tantangan #SaveWater bersama komunitas" },
    ],
    suggestedHashtags: ["WorldWaterDay", "HematAir"],
  },
  // ================= APRIL =================
  {
    name: "Hari Bumi",
    description: "Sustainability & eco-friendly products.",
    month: 4,
    day: 22,
    scope: "international",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Eco product highlight",
        example: "Produk ramah lingkungan: kemasan daur ulang, bahan organik",
      },
      { angle: "Aksi nyata", example: "Donasi per pembelian untuk penanaman pohon" },
    ],
    suggestedHashtags: ["EarthDay", "HariBumi", "GoGreen"],
  },
  {
    name: "Hari Buku Sedunia",
    description: "Literasi — cocok untuk brand edukasi & stationery.",
    month: 4,
    day: 23,
    scope: "international",
    category: "pendidikan",
    ideaTemplates: [
      { angle: "Rekomendasi buku", example: "5 buku favorit founder yang mengubah cara bisnisnya" },
    ],
    suggestedHashtags: ["WorldBookDay", "AyoMembaca"],
  },
  // ================= MEI =================
  {
    name: "Hari Buruh Internasional",
    description: "Apresiasi pekerja — momentum promosi 'hadiah untuk pekerja'.",
    month: 5,
    day: 1,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Apresiasi tim",
        example: "Kenalkan tim di balik layar — wajah manusia membangun trust",
      },
      { angle: "Promo pekerja", example: "Flash sale 'kompensi lembur' sore hari" },
    ],
    suggestedHashtags: ["MayDay", "HariBuruh", "LabourDay"],
  },
  {
    name: "Hari Pendidikan Nasional",
    description: "Hardiknas — momentum edukasi & promo kelas.",
    month: 5,
    day: 2,
    scope: "national",
    category: "pendidikan",
    ideaTemplates: [
      { angle: "Promo belajar", example: "Diskon kelas/e-book untuk pelajar & mahasiswa" },
      { angle: "Konten edukatif", example: "Bagikan 1 skill gratis yang biasanya berbayar" },
    ],
    suggestedHashtags: ["Hardiknas", "HariPendidikanNasional"],
  },
  {
    name: "Hari Ibu (internasional)",
    description: "Mother's Day versi internasional (Indonesia: 22 Des). Keduanya momentum kuat.",
    month: 5,
    day: 11,
    scope: "international",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Promo hadiah ibu",
        example: "Gift guide untuk ibu sesuai budget — carousel pinjam mudah",
      },
      { angle: "Konten emosional", example: "Testimoni anak yang beli produkmu untuk ibunya" },
    ],
    suggestedHashtags: ["MothersDay", "HariIbu", "TerimaKasihIbu"],
  },
  // ================= JUNI =================
  {
    name: "Hari Lingkungan Hidup Sedunia",
    description: "Kampanye lingkungan global.",
    month: 6,
    day: 5,
    scope: "international",
    category: "umum",
    ideaTemplates: [
      { angle: "Komitmen brand", example: "1% revenue untuk lingkungan — ceritakan dampaknya" },
    ],
    suggestedHashtags: ["WorldEnvironmentDay", "LingkunganHidup"],
  },
  {
    name: "Hari Ayah",
    description: "Father's Day (3 Minggu Juni).",
    month: 6,
    day: 15,
    scope: "international",
    category: "retail",
    ideaTemplates: [
      { angle: "Gift guide ayah", example: "Produk yang bikin ayah tersenyum — video reaksi" },
    ],
    suggestedHashtags: ["FathersDay", "HariAyah"],
  },
  // ================= JULI =================
  {
    name: "Hari Anak Nasional",
    description: "Momentum keluarga & produk anak.",
    month: 7,
    day: 23,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      { angle: "Promo keluarga", example: "Buy 1 for kid, donate 1 for those in need" },
      {
        angle: "Konten nostalgia",
        example: "Makanan/mainan zaman SD — ajak followers bernostalgia",
      },
    ],
    suggestedHashtags: ["HariAnakNasional", "NationalChildrenDay"],
  },
  // ================= AGUSTUS =================
  {
    name: "Hari Kebangkitan Teknologi Nasional",
    description: "Harkitnas — inovasi & teknologi.",
    month: 8,
    day: 10,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Teknologi brand",
        example: "Tool/process baru yang kamu adopsi untuk melayani pelanggan lebih baik",
      },
    ],
    suggestedHashtags: ["Harkitnas", "InovasiIndonesia"],
  },
  {
    name: "Hari Kemerdekaan Indonesia",
    description: "17 Agustus — momentum nasionalisme & kreativitas lomba. Traffic konten terbesar.",
    month: 8,
    day: 17,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Konten kemerdekaan",
        example: "Lomba digital (giveaway) dengan syarat repost & tag 3 teman",
      },
      { angle: "Promo merah putih", example: "Diskon 17% atau bundling harga 17.170" },
      {
        angle: "Nostalgia lomba",
        example: "Video tim main lomba 17-an: krupuk, balap karung — humanis & relatable",
      },
    ],
    suggestedHashtags: ["TujuhBelasAgustus", "DirgahayuIndonesia", "KemerdekaanRI", "Merdeka"],
  },
  {
    name: "Hari UMKM Nasional",
    description: "Apresiasi UMKM Indonesia — brand kamu adalah bintangnya.",
    month: 8,
    day: 19,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Cerita perjalanan",
        example: "Dari garage/kamar ke ratusan pelanggan — storytelling jujur",
      },
      {
        angle: "Kolaborasi sesama UMKM",
        example: "Bundle collab dengan UMKM lain — audien saling promosi",
      },
    ],
    suggestedHashtags: ["HariUMKMNasional", "BanggaUMKM", "UMKMIndonesia", "BelanjaLokal"],
  },
  // ================= OKTOBER =================
  {
    name: "Hari Batik Nasional",
    description: "Apresiasi batik Indonesia — sangat kuat untuk konten fashion & budaya.",
    month: 10,
    day: 2,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Tunjukkan batik",
        example: "Tim memakai batik — carousel beragam motif & maknanya",
      },
      {
        angle: "Edukasi motif",
        example: "Kenali 5 motif batik dan filosofinya (konten saves-tinggi)",
      },
    ],
    suggestedHashtags: ["HariBatikNasional", "BatikIndonesia", "BanggaBuatanIndonesia"],
  },
  {
    name: "Hari Pangan Sedunia",
    description: "Pangan & kuliner — cocok untuk F&B.",
    month: 10,
    day: 16,
    scope: "international",
    category: "kuliner",
    ideaTemplates: [
      {
        angle: "Behind the scene",
        example: "Dari petani ke meja makan — rantai pasok produk kulinermu",
      },
    ],
    suggestedHashtags: ["WorldFoodDay", "PanganLokal"],
  },
  {
    name: "Hari Santri Nasional",
    description: "Apresiasi santri & pesantren.",
    month: 10,
    day: 22,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      { angle: "Cerita santri", example: "Kisah alumni pesantren yang jadi entrepreneur sukses" },
    ],
    suggestedHashtags: ["HariSantriNasional", "SantriHebat"],
  },
  {
    name: "Hari Halloween",
    description: "Momentum kreatif kostum & konten seram-seram lucu.",
    month: 10,
    day: 31,
    scope: "international",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Konten kreatif",
        example: "Tim ber-kostum produkmu — konten relatable & shareable",
      },
      { angle: "Promo bertema", example: "Diskon 'scary good deals' tengah malam" },
    ],
    suggestedHashtags: ["Halloween", "Halloween2026", "SpookySeason"],
  },
  // ================= NOVEMBER =================
  {
    name: "Single's Day / 11.11",
    description: "Hari belanja terbesar dari China — momentum promo besar-besaran.",
    month: 11,
    day: 11,
    scope: "international",
    category: "retail",
    ideaTemplates: [
      { angle: "Promo besar", example: "Flash sale 11.11 dengan stok terbatas & countdown" },
      {
        angle: "Konten single life",
        example: "Self-care package untuk yang menikmati waktu sendiri",
      },
    ],
    suggestedHashtags: ["1111", "SinglesDay", "BigSale"],
  },
  {
    name: "Hari Pahlawan Nasional",
    description: "10 November — kepahlawanan & sejarah.",
    month: 11,
    day: 10,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      {
        angle: "Pahlawan modern",
        example: '"Pahlawan tanpa cape" — apresiasi kurir/guru/tenaga kesehatan pelangganmu',
      },
    ],
    suggestedHashtags: ["HariPahlawan", "SemangatPahlawan"],
  },
  {
    name: "Black Friday",
    description: "Jumat setelah Thanksgiving — diskon tahunan terbesar dunia.",
    month: 11,
    day: 28,
    scope: "international",
    category: "retail",
    ideaTemplates: [
      { angle: "Diskon agresif", example: "Doorbuster deal per jam — scarcity & urgency" },
      {
        angle: "Teaser",
        example: "Hitung mundur 7 hari sebelumnya setiap hari (build anticipation)",
      },
    ],
    suggestedHashtags: ["BlackFriday", "BlackFridaySale", "BF2026"],
  },
  // ================= DESEMBER =================
  {
    name: "Hari Belanja Online Nasional (Harbolnas 12.12)",
    description: "Puncak belanja online Indonesia.",
    month: 12,
    day: 12,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      { angle: "Promo puncak", example: "Diskon 12.12 + gratis ongkir — pastikan stok & tim siap" },
      { angle: "Live selling", example: "Live khusus 12.12 dengan flash deal tiap 12 menit" },
    ],
    suggestedHashtags: ["Harbolnas1212", "1212", "SeruSeruan1212"],
  },
  {
    name: "Hari Ibu (Indonesia)",
    description: "22 Desember — Hari Ibu versi Indonesia, sangat kuat untuk pasar lokal.",
    month: 12,
    day: 22,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Konten emosional",
        example: "Surat terbuka untuk ibu dari founder — video raw & jujur",
      },
      {
        angle: "Promo hadiah",
        example: "Gift wrapping gratis + kartu ucapan untuk semua pembelian",
      },
    ],
    suggestedHashtags: ["HariIbu", "MothersDayID", "TerimaKasihIbu"],
  },
  {
    name: "Natal",
    description: "25 Desember — puncak belanja & konten kehangatan.",
    month: 12,
    day: 25,
    scope: "national",
    category: "retail",
    ideaTemplates: [
      {
        angle: "Gift guide akhir",
        example: '"Belanja Natal detik terakhir" — solusi untuk yang telat',
      },
      {
        angle: "Konten kehangatan",
        example: "Ucapan Natal dari tim + recap tahun yang telah berlalu",
      },
    ],
    suggestedHashtags: ["MerryChristmas", "Natal", "Christmas2026"],
  },
  {
    name: "Malam Tahun Baru",
    description: "31 Desember — refleksi & momentum promosi awal tahun.",
    month: 12,
    day: 31,
    scope: "national",
    category: "umum",
    ideaTemplates: [
      { angle: "Recap tahun", example: 'Carousel "12 momen berkesan brand kami tahun ini"' },
      {
        angle: "Teaser tahun depan",
        example: "Sneak peek produk/fitur yang akan hadir tahun depan",
      },
    ],
    suggestedHashtags: ["NewYearsEve", "SeeYouNextYear", "Recap2026"],
  },
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS "holiday" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "month" INTEGER NOT NULL,
      "day" INTEGER NOT NULL,
      "scope" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'umum',
      "idea_templates" JSONB,
      "suggested_hashtags" JSONB,
      "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "holiday_month_day_name_idx"
      ON "holiday" ("month", "day", "name");
    CREATE INDEX IF NOT EXISTS "holiday_month_day_idx"
      ON "holiday" ("month", "day");
  `);
  console.log("OK: tabel holiday dibuat/diverifikasi");

  let inserted = 0;
  for (const h of HOLIDAYS) {
    const id = `sk_holiday_${h.month.toString().padStart(2, "0")}${h.day
      .toString()
      .padStart(2, "0")}_${h.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40)}`;
    const res = await client.query(
      `INSERT INTO "holiday" ("id","name","description","month","day","scope","category","idea_templates","suggested_hashtags")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT ("month","day","name") DO NOTHING`,
      [
        id,
        h.name,
        h.description,
        h.month,
        h.day,
        h.scope,
        h.category,
        JSON.stringify(h.ideaTemplates),
        JSON.stringify(h.suggestedHashtags),
      ],
    );
    inserted += res.rowCount ?? 0;
  }
  console.log(`OK: ${inserted} hari besar baru disisipkan (total seed: ${HOLIDAYS.length})`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
