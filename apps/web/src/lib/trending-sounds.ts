// Data kurasi trending sounds Instagram & TikTok.
// TIDAK ada API publik resmi untuk trending sounds — daftar ini dikurasi manual
// oleh tim (judul lagu generik yang realistis tren di Indonesia/global) dan
// diperbarui berkala. usageCount & growth adalah indikasi kumulatif platform.

export type TrendingPlatform = "instagram" | "tiktok";

export type TrendingCategory = "lifestyle" | "edukasi" | "hiburan" | "bisnis" | "musik";

export type TrendingSound = {
  id: string;
  /** Judul lagu/sound */
  title: string;
  /** Nama artis/pembuat sound */
  artist: string;
  platform: TrendingPlatform;
  /** Genre musik (pop, dangdut, dsb.) */
  genre: string;
  /** Estimasi jumlah penggunaan lintas konten */
  usageCount: number;
  /** Pertumbuhan pemakaian mingguan (persen) */
  growth: number;
  /** Penjelasan kenapa sound ini cocok untuk konten apa */
  hook: string;
  category: TrendingCategory;
};

export const TRENDING_CATEGORY_LABELS: Record<TrendingCategory, string> = {
  lifestyle: "Lifestyle",
  edukasi: "Edukasi",
  hiburan: "Hiburan",
  bisnis: "Bisnis",
  musik: "Musik",
};

export const TRENDING_SOUNDS: TrendingSound[] = [
  {
    id: "sk-sound-01",
    title: "Cinta di Ujung Senja",
    artist: "Aluna Zahra",
    platform: "instagram",
    genre: "Pop akustik",
    usageCount: 1200000,
    growth: 45,
    hook: "Melodi lembut dengan lirik romantis — cocok untuk konten golden hour, OOTD, dan momen kebersamaan yang estetik.",
    category: "lifestyle",
  },
  {
    id: "sk-sound-02",
    title: "Sahur Bersama",
    artist: "Kosan Band",
    platform: "tiktok",
    genre: "Pop humor",
    usageCount: 890000,
    growth: 62,
    hook: "Tempo ceria dengan punchline lucu — pas untuk konten komedi situasi, sketsa kehidupan kosan, dan momen sahur berkeluarga.",
    category: "hiburan",
  },
  {
    id: "sk-sound-03",
    title: "Sunset Drive",
    artist: "Neon Kapten",
    platform: "instagram",
    genre: "Synthwave",
    usageCount: 760000,
    growth: 38,
    hook: "Nada synth yang membangun suasana — ideal untuk konten perjalanan (travel), transisi produk, dan video mobil/motor estetik.",
    category: "lifestyle",
  },
  {
    id: "sk-sound-04",
    title: "Belajar Itu Keren",
    artist: "MPK Collective",
    platform: "tiktok",
    genre: "Lo-fi beat",
    usageCount: 540000,
    growth: 51,
    hook: "Beat lo-fi yang menenangkan — cocok untuk konten study with me, tips belajar, dan pembahasan soal dengan tulisan tangan di whiteboard.",
    category: "edukasi",
  },
  {
    id: "sk-sound-05",
    title: "Duit Masuk",
    artist: "Grup Nusa",
    platform: "tiktok",
    genre: "Hip-hop",
    usageCount: 980000,
    growth: 57,
    hook: "Beat energik dengan tema keuangan — pas untuk konten motivasi bisnis, showcase produk, dan pengumuman promo/discount.",
    category: "bisnis",
  },
  {
    id: "sk-sound-06",
    title: "Rindu di Menara",
    artist: "Sandy Anandra",
    platform: "instagram",
    genre: "Pop Indonesia",
    usageCount: 2300000,
    growth: 41,
    hook: "Ballad emosional yang sedang viral — cocok untuk konten cerita pribadi, refleksi hidup, dan video caption panjang yang menyentuh.",
    category: "musik",
  },
  {
    id: "sk-sound-07",
    title: "Coffee & Chill",
    artist: "Mila Morning",
    platform: "instagram",
    genre: "Jazz kafe",
    usageCount: 450000,
    growth: 29,
    hook: "Jazz santai dengan suasana kafe — ideal untuk konten cafe hopping, vlog pagi hari, dan behind the scene workspace.",
    category: "lifestyle",
  },
  {
    id: "sk-sound-08",
    title: "Cepat itu Gampang",
    artist: "Duo Semangka",
    platform: "tiktok",
    genre: "Dangdut remix",
    usageCount: 1700000,
    growth: 68,
    hook: "Dangdut upbeat dengan hook yang nempel — sempurna untuk konten tutorial cepat, hack sehari-hari, dan transisi before-after yang playful.",
    category: "hiburan",
  },
  {
    id: "sk-sound-09",
    title: "Gym Mode On",
    artist: "Iron Beats",
    platform: "tiktok",
    genre: "EDM workout",
    usageCount: 630000,
    growth: 34,
    hook: "Drop EDM yang memicu adrenalin — cocok untuk konten workout transformation, gym check-in, dan progres fitness mingguan.",
    category: "lifestyle",
  },
  {
    id: "sk-sound-10",
    title: "Startup Grind",
    artist: "Founder Frequency",
    platform: "instagram",
    genre: "Corporate pop",
    usageCount: 310000,
    growth: 26,
    hook: "Melodi motivasi ala TED Talk — pas untuk konten sharing ilmu bisnis, pengumuman produk baru, dan cerita perjalanan founder.",
    category: "bisnis",
  },
  {
    id: "sk-sound-11",
    title: "Sains Seru",
    artist: "Lab Notes",
    platform: "tiktok",
    genre: "Electro-pop",
    usageCount: 420000,
    growth: 49,
    hook: "Melodi penuh rasa penasaran — cocok untuk konten my vs facts, eksperimen rumahan, dan penjelasan konsep sains dengan visual menarik.",
    category: "edukasi",
  },
  {
    id: "sk-sound-12",
    title: "Senja di Pelabuhan",
    artist: "Band Maritim",
    platform: "instagram",
    genre: "Folk Indonesia",
    usageCount: 580000,
    growth: 33,
    hook: "Folk akustik dengan sentuhan pantai — ideal untuk konten kuliner seafood, wisata pesisir, dan momen sunset dengan keluarga.",
    category: "musik",
  },
  {
    id: "sk-sound-13",
    title: "Beli Lagi!",
    artist: "Checkout Squad",
    platform: "tiktok",
    genre: "Trap comercial",
    usageCount: 710000,
    growth: 55,
    hook: "Beat trap yang tajam — pas untuk konten unboxing, flash sale, dan product demo dengan transisi cepat antar item.",
    category: "bisnis",
  },
  {
    id: "sk-sound-14",
    title: "Satu Hari Satu Ilmu",
    artist: "Pojok Ilmu",
    platform: "instagram",
    genre: "Ambient chill",
    usageCount: 380000,
    growth: 44,
    hook: "Nada ambient yang tenang — cocok untuk konten carousel tips, infographic edukatif, dan penjelasan langkah-demi-langkah.",
    category: "edukasi",
  },
  {
    id: "sk-sound-15",
    title: "Kuliner Nusantara",
    artist: "Rasa Records",
    platform: "tiktok",
    genre: "Keroncong modern",
    usageCount: 850000,
    growth: 47,
    hook: "Keroncong modern yang hangat — sempurna untuk konten makanan tradisional, resep keluarga, dan food review dengan sentuhan lokal.",
    category: "hiburan",
  },
];
