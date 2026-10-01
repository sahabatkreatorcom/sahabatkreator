/**
 * Mengubah rekaman mentah (`docs-fixtures/raw.json`) menjadi fixture fiktif
 * yang aman di-commit (`docs-fixtures/fixtures.json`).
 *
 * Prinsipnya: UI tetap dirender aplikasi sungguhan, tapi seluruh data yang
 * tampil adalah karangan. Tidak ada nama orang, handle, foto, isi DM, email,
 * atau tautan milik siapa pun.
 *
 * Cara kerja:
 *   1. Setiap nilai teks diperiksa berdasarkan NAMA KUNCI-nya. Kunci `username`
 *      diperlakukan berbeda dari `name`, `caption`, `avatarUrl`, dan seterusnya.
 *   2. Nilai yang sama selalu dipetakan ke karangan yang sama (kamus), jadi satu
 *      akun tampil konsisten di seluruh halaman.
 *   3. Semua URL aset (avatar, thumbnail, lampiran) diganti berkas SVG lokal di
 *      public/docs/mock/ — sekaligus menutup masalah tautan bertanda tangan yang
 *      kedaluwarsa.
 *   4. Beberapa endpoint sengaja DILEWATI apa adanya karena isinya bukan data
 *      pribadi, melainkan informasi publik: hari libur, nama paket langganan,
 *      nama peran, dan data tren (judul lagu/video beserta kanalnya). Mengganti
 *      nama hari libur jadi nama brand justru membuat halaman terlihat kacau.
 *   5. Di akhir ada AUDIT: memastikan tidak satu pun nilai yang sudah diganti
 *      muncul kembali, dan melaporkan nilai yang diteruskan agar bisa diperiksa.
 *
 * Cara pakai:
 *   bun run docs:fixtures:sanitize
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const FIXTURE_DIR = path.resolve(import.meta.dirname, "docs-fixtures");
const RAW_FILE = path.join(FIXTURE_DIR, "raw.json");
const OUT_FILE = path.join(FIXTURE_DIR, "fixtures.json");
const MOCK_DIR = path.resolve(import.meta.dirname, "..", "public", "docs", "mock");

// ---------------------------------------------------------------------------
// Kumpulan karangan
// ---------------------------------------------------------------------------

/** Nama depan + belakang dipasangkan agar jumlah nama unik jauh lebih banyak
 *  daripada jumlah akun yang perlu ditampilkan — dua akun berbeda tidak boleh
 *  muncul dengan nama yang sama di halaman dokumentasi. */
const FIRST_NAMES = [
  "Rina",
  "Bagas",
  "Maya",
  "Dimas",
  "Sari",
  "Fajar",
  "Intan",
  "Yoga",
  "Nadia",
  "Reza",
  "Putri",
  "Adit",
  "Wulan",
  "Hendra",
  "Citra",
  "Bayu",
  "Lestari",
  "Galih",
  "Anisa",
  "Taufik",
];

const LAST_NAMES = [
  "Kartika",
  "Prasetyo",
  "Anggraini",
  "Nugroho",
  "Wulandari",
  "Ramadhan",
  "Permatasari",
  "Saputra",
  "Kusuma",
  "Mahendra",
  "Handayani",
  "Firmansyah",
];

/** Nama orang ke-`index` — deterministik, dan nama belakangnya diambil dengan
 *  langkah 7 (saling prima dengan 12) supaya tidak semua orang bernama belakang
 *  sama sampai 20 nama pertama. */
function personAt(index: number): string {
  const first = FIRST_NAMES[index % FIRST_NAMES.length] as string;
  const last = LAST_NAMES[(index * 7) % LAST_NAMES.length] as string;
  return `${first} ${last}`;
}

const BRANDS = [
  "Kopi Senja",
  "Toko Bunga Mawar",
  "Katering Bu Yati",
  "Barbershop Ganteng",
  "Kelas Bahasa Cepat",
  "Hijab Store Ayu",
  "Frozen Food Mama",
  "Bengkel Motor Jaya",
  "Roti Bakar Legit",
  "Laundry Kilat",
  "Studio Foto Cerah",
  "Kebun Hidroponik Hijau",
  "Warung Sate Madura",
  "Aneka Kue Kering",
  "Jasa Cetak Cepat",
  "Pet Shop Sehat",
  "Sepatu Kulit Lokal",
  "Klinik Gigi Senyum",
  "Toko Bangunan Jaya",
  "Travel Wisata Murah",
];

const CAPTIONS = [
  "Promo akhir pekan — stok terbatas, siapa cepat dia dapat.",
  "Di balik layar proses produksi hari ini. Terima kasih atas antusiasnya!",
  "Tips singkat yang sering ditanyakan pelanggan baru.",
  "Menu baru sudah tersedia. Coba dan ceritakan pendapatmu.",
  "Terima kasih untuk 100 pesanan pertama bulan ini.",
  "Tiga hal yang perlu disiapkan sebelum mulai berjualan online.",
  "Jadwal buka minggu ini — ada perubahan hari libur.",
  "Cara memilih yang sesuai kebutuhan, bukan yang paling mahal.",
  "Kesalahan umum yang membuat hasilnya kurang maksimal.",
  "Hari ini kirim lebih awal supaya sampai sebelum sore.",
  "Pertanyaan paling sering masuk minggu ini, kami jawab di sini.",
  "Contoh hasil sebelum dan sesudah, tanpa filter berlebihan.",
];

const COMMENTS = [
  "Masih ada stok untuk ukuran sedang?",
  "Kak, bisa kirim ke luar kota?",
  "Harganya berapa ya kalau ambil dua?",
  "Sudah pernah coba, hasilnya bagus.",
  "Boleh minta info lebih lengkap?",
  "Mantap, lanjutkan kontennya.",
  "Ini yang saya cari dari kemarin.",
  "Kalau untuk pemula, mulai dari mana ya?",
  "Terima kasih infonya, sangat membantu.",
  "Kapan dibuka lagi cabang barunya?",
];

const DM_MESSAGES = [
  "Halo kak, mau tanya-tanya dulu boleh?",
  "Kalau ambil hari ini, masih bisa dikirim besok?",
  "Baik kak, nanti saya kabari lagi setelah dihitung.",
  "Terima kasih responnya cepat sekali.",
  "Kak, yang kemarin saya pesan sudah dikirim belum?",
  "Bisa minta daftar harganya?",
  "Sudah saya transfer ya kak, mohon dicek.",
  "Untuk pembayaran bisa lewat apa saja?",
];

const TITLES = [
  "Rencana konten minggu ini",
  "Promo akhir bulan",
  "Perkenalan produk baru",
  "Ringkasan performa bulan lalu",
  "Tanya jawab pelanggan",
  "Panduan singkat untuk pemula",
  "Kegiatan tim minggu ini",
  "Uji coba format konten baru",
];

/** Nilai yang memang sudah netral — biarkan apa adanya. */
const KEEP_VALUES = new Set(["Demo Kreator"]);

const AVATAR_COUNT = 12;
const MEDIA_COUNT = 8;
const LOGO_COUNT = 4;

/**
 * Penanda versi pada URL placeholder. Aset di public/ disajikan dengan
 * "Cache-Control: immutable, max-age=2592000" (lihat sahabatkreator.conf), dan
 * Cloudflare memakai URL lengkap termasuk query sebagai kunci cache. Pernah
 * terjadi: satu kali menjalankan skrip tangkapan layar SEBELUM placeholder-nya
 * ter-deploy membuat Cloudflare mengunci balasan 404 selama 30 hari untuk URL
 * tanpa query — gambarnya rusak bagi semua pengunjung. Query ini memastikan
 * setiap kali isi placeholder berubah kita bisa memaksa kunci cache baru.
 * Naikkan angkanya bila isi berkas SVG di public/docs/mock/ berubah.
 */
const MOCK_ASSET_VERSION = 1;

// ---------------------------------------------------------------------------
// Aturan per kunci
// ---------------------------------------------------------------------------
const HANDLE_KEYS = /(username|handle)$/i;
const NAME_KEYS =
  /^(name|full_name|fullName|display_name|displayName|author_name|authorName|partner_name|partnerName|account_name|accountName|organization_name|organizationName|owner_name|ownerName|sender_name|senderName|recipient_name|recipientName|participant_name|participantName|channel_title|channelTitle|page_name|pageName)$/i;
const TEXT_KEYS =
  /^(content|text|caption|body|comment|description|snippet|subject|preview|note|bio|about|summary|question|first_comment|firstComment|last_message_preview|lastMessagePreview|reply_content|replyContent|draft_reply|draftReply|title)$/i;
const EMAIL_KEYS = /email/i;
const PHONE_KEYS = /phone|whatsapp|msisdn|telp|telepon/i;
const ASSET_KEYS =
  /(avatar|picture|photo|logo|thumbnail|thumb|image|cover|poster|media_url|mediaUrl|file_url|fileUrl|preview_url|previewUrl|attachment)/i;
const SECRET_KEYS =
  /(^|_)(token|secret|password|api_key|apiKey|public_key|publicKey|vapid|client_secret|clientSecret|access_token|refresh_token)/i;
const SLUG_KEYS = /^slug$/i;

/** Kunci yang bisa dipakai sebagai nama tampilan untuk menurunkan handle. */
const NAME_HINT_KEYS = ["name", "displayName", "partnerName", "authorName", "channelTitle"];

/**
 * Endpoint yang teksnya boleh dibiarkan utuh di bawah ini.
 *
 * Dua lapis, dan urutannya penting:
 *
 *   • PASSTHROUGH_ENDPOINT — isinya memang informasi publik (nama hari besar,
 *     judul tren, nama paket, nama peran). Dibuat orang lain, tapi bukan data
 *     pribadi.
 *
 *   • OWN_TEXT_ENDPOINT — isinya dibuat PEMILIK AKUN DEMO sendiri: nama rule
 *     automation, nama monitor, nama sumber web, dan deskripsi rule. Label
 *     seperti "Balas pertanyaan harga" atau "Pemantauan merek & pesaing" kalau
 *     ikut disanitasi berubah jadi nama orang ("Nadia Kusuma", "Bagas Saputra")
 *     dan tangkapan layarnya justru menyesatkan. Isi pesan balasan, keyword,
 *     nama pelanggan, dan URL sumber TETAP disanitasi.
 */
const PASSTHROUGH_ENDPOINT = /^\/api\/(holiday|billing\/plans|team\/roles|push\/vapid|trends)/;
// `/api/listening` (tanpa sub-path) ikut: di situ nama monitor dikirim, jadi
// tanpa mencantumkannya label "Pemantauan merek & pesaing" berubah jadi nama orang.
const OWN_TEXT_ENDPOINT =
  /^\/api\/(automation|listening(\/|$)|listening\/monitors|listening\/sources)/;
// `name` = nama rule/monitor/sumber · `description` = deskripsi rule (diketik pemilik akun).
// `keywords`/`excludedTerms` TIDAK termasuk — itu kata yang dipantau, bukan label.
const OWN_TEXT_KEYS = new Set(["name", "description"]);

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isAssetUrl(value: string): boolean {
  if (/\.(png|jpe?g|webp|gif|avif|svg|mp4|mov|webm|m3u8|bmp|tiff)(\?|#|$)/i.test(value))
    return true;
  if (!looksLikeUrl(value)) return false;
  const { host, pathname } = new URL(value);
  if (host === "sahabatkreator.com" || host.endsWith(".sahabatkreator.com")) {
    return /^\/(api\/(media|files|storage|renders)|uploads?)\b/.test(pathname);
  }
  return false; // host luar tanpa ekstensi aset → kemungkinan tautan profil
}

// ---------------------------------------------------------------------------
// Kamus: nilai asli → karangan
// ---------------------------------------------------------------------------
type Kind = "person" | "brand" | "caption" | "comment" | "dm" | "title";

const POOLS: Record<Exclude<Kind, "person">, string[]> = {
  brand: BRANDS,
  caption: CAPTIONS,
  comment: COMMENTS,
  dm: DM_MESSAGES,
  title: TITLES,
};

const dictionaries = new Map<string, string>();
const replacedOriginals = new Set<string>();
/** Nilai yang dipertahankan karena sudah netral (bukan hasil sanitasi). */
const keptNeutral = new Set<string>();
/** Berapa nama orang yang sudah dipakai — dipakai untuk personAt(). */
let personCount = 0;

function fromDictionary(original: string, kind: Kind): string {
  const existing = dictionaries.get(original);
  if (existing) return existing;

  let fake: string;
  if (kind === "person") {
    // Nama orang dihasilkan dari pasangan nama depan+belakang, jadi tidak
    // kehabisan dan tidak ada dua akun berbeda yang tampil dengan nama sama.
    fake = personAt(personCount);
    personCount += 1;
  } else {
    const list = POOLS[kind];
    const taken = new Set(dictionaries.values());
    // Pakai nama yang belum terpakai lebih dulu; baru menambah pembeda kalau
    // kolamnya memang sudah habis.
    const free = list.find((candidate) => !taken.has(candidate));
    fake = free ?? `${list[list.length - 1] as string} ${taken.size + 1}`;
  }
  dictionaries.set(original, fake);
  replacedOriginals.add(original);
  return fake;
}

/** Handle diturunkan dari nama karangan supaya terbaca masuk akal. */
function handleFor(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return slug.length > 0 ? slug : "akun.contoh";
}

const handleDictionary = new Map<string, string>();

function fakeHandle(original: string, nameHint: string | null): string {
  const existing = handleDictionary.get(original);
  if (existing) return existing;

  const base = nameHint ? handleFor(nameHint) : "akun.contoh";
  const taken = new Set(handleDictionary.values());
  let fake = base;
  let suffix = 2;
  // Tambahkan pembeda hanya kalau perlu, supaya handle pertama tetap bersih
  // (@fajar.ramadhan, bukan @fajar.ramadhan.2).
  while (taken.has(fake)) {
    fake = `${base}.${suffix}`;
    suffix += 1;
  }
  handleDictionary.set(original, fake);
  replacedOriginals.add(original);
  return fake;
}

const assetDictionary = new Map<string, string>();

function fakeAsset(original: string, key: string): string {
  const existing = assetDictionary.get(original);
  if (existing) return existing;
  const kind = /logo/i.test(key)
    ? { dir: "logo", count: LOGO_COUNT }
    : /avatar|picture|photo/i.test(key)
      ? { dir: "avatar", count: AVATAR_COUNT }
      : { dir: "media", count: MEDIA_COUNT };
  const index = (assetDictionary.size % kind.count) + 1;
  const fake = `/docs/mock/${kind.dir}-${String(index).padStart(2, "0")}.svg?v=${MOCK_ASSET_VERSION}`;
  assetDictionary.set(original, fake);
  replacedOriginals.add(original);
  return fake;
}

const linkDictionary = new Map<string, string>();

function fakeLink(original: string): string {
  const existing = linkDictionary.get(original);
  if (existing) return existing;
  const fake = `https://contoh.id/tautan/${linkDictionary.size + 1}`;
  linkDictionary.set(original, fake);
  replacedOriginals.add(original);
  return fake;
}

const emailDictionary = new Map<string, string>();

function fakeEmail(original: string): string {
  const existing = emailDictionary.get(original);
  if (existing) return existing;
  const fake =
    emailDictionary.size === 0 ? "demo@contoh.id" : `demo${emailDictionary.size + 1}@contoh.id`;
  emailDictionary.set(original, fake);
  replacedOriginals.add(original);
  return fake;
}

// ---------------------------------------------------------------------------
// Penelusuran struktur
// ---------------------------------------------------------------------------
const KEPT_SAMPLES = new Map<string, Set<string>>();

function recordKept(key: string, value: string) {
  const bucket = KEPT_SAMPLES.get(key) ?? new Set<string>();
  if (bucket.size < 4) bucket.add(value.slice(0, 50));
  KEPT_SAMPLES.set(key, bucket);
}

function sanitizeString(
  value: string,
  key: string,
  parentName: string | null,
  passthrough: boolean,
  ownText: boolean,
): string {
  if (KEEP_VALUES.has(value)) {
    keptNeutral.add(value);
    return value;
  }
  // Teks kosong dibiarkan kosong — jangan sampai field yang memang tidak diisi
  // berubah menjadi nama karangan.
  if (value.trim().length === 0) return value;
  if (SECRET_KEYS.test(key)) return "REDACTED";
  if (looksLikeUrl(value)) {
    if (isAssetUrl(value) || ASSET_KEYS.test(key)) return fakeAsset(value, key);
    return fakeLink(value);
  }
  // Bluesky memakai URI `at://did:plc:…` yang memuat DID akun — bukan URL http,
  // jadi harus ditangani terpisah.
  if (/^at:\/\//i.test(value)) return fakeLink(value);
  if (EMAIL_KEYS.test(key) || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(value)) return fakeEmail(value);
  if (PHONE_KEYS.test(key)) return "+62 812-0000-0000";

  if (passthrough) {
    recordKept(key, value);
    return value;
  }

  // Label yang diketik sendiri pemilik akun (nama rule/monitor) dibiarkan utuh;
  // lihat OWN_TEXT_ENDPOINT. Isi pesan & keyword tetap disanitasi.
  if (ownText && OWN_TEXT_KEYS.has(key)) {
    recordKept(`own:${key}`, value);
    return value;
  }

  if (SLUG_KEYS.test(key)) return "demo-kreator";
  if (HANDLE_KEYS.test(key)) {
    // Awalan @ dibuang; tampilan yang menambahkannya kembali.
    const bare = value.replace(/^@/, "");
    // parentName di sini sudah berupa nama KARANGAN (lihat walk), jadi handle
    // turunannya konsisten dengan nama yang tampil di kartu.
    //
    // Sebagian kartu tidak punya nama tampilan sama sekali — mis. kartu akun
    // sosial yang judulnya hanya nama platform. Tanpa cadangan, semua kartu itu
    // jatuh ke "@akun.contoh" yang sama dan terlihat jelas sebagai placeholder
    // (dan bisa bentrok). Pakai nama orang karangan sebagai gantinya.
    const hint = parentName ?? personAt(personCount++);
    return fakeHandle(bare, hint);
  }
  if (NAME_KEYS.test(key)) {
    const kind: Kind = /page|account|organization|brand/i.test(key) ? "brand" : "person";
    return fromDictionary(value, kind);
  }
  if (TEXT_KEYS.test(key)) {
    if (/title|subject/i.test(key)) return fromDictionary(value, "title");
    if (/message|preview|snippet|reply|draft/i.test(key)) return fromDictionary(value, "dm");
    if (/comment|question/i.test(key)) return fromDictionary(value, "comment");
    // Kolom prosa panjang (isi postingan, bio, ringkasan) selalu pakai kalimat
    // caption. Kalau dipilih dari kolam komentar, isi postingan di /queue
    // terbaca seperti pertanyaan pelanggan — membingungkan di dokumentasi.
    if (/content|caption|body|description|summary|note|bio|about/i.test(key)) {
      return fromDictionary(value, "caption");
    }
    // "text" bisa berupa label pendek maupun prosa; panjangnya yang menentukan.
    if (/text/i.test(key)) {
      return value.length > 24
        ? fromDictionary(value, "caption")
        : fromDictionary(value, "comment");
    }
    return fromDictionary(value, "title");
  }

  recordKept(key, value);
  return value;
}

function walk(
  node: unknown,
  key: string,
  parentName: string | null,
  passthrough: boolean,
  ownText: boolean,
): unknown {
  if (typeof node === "string") return sanitizeString(node, key, parentName, passthrough, ownText);
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, key, parentName, passthrough, ownText));
  }
  if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    // Nama tampilan disanitasi LEBIH DULU supaya handle di objek yang sama bisa
    // diturunkan darinya. Tanpa ini, urutan kunci di JSON menentukan hasilnya:
    // kalau `username` muncul sebelum nama, handle jatuh ke pola umum
    // (@akun.contoh.3) padahal namanya sudah ada.
    //
    // Kuncinya berbeda-beda antar endpoint — akun sosial memakai `displayName`,
    // percakapan DM `partnerName`, komentar `authorName` — jadi semuanya dilihat.
    const hintKey = NAME_HINT_KEYS.find((candidate) => typeof record[candidate] === "string");
    const ownName = hintKey
      ? (sanitizeString(
          record[hintKey] as string,
          hintKey,
          parentName,
          passthrough,
          ownText,
        ) as string)
      : parentName;
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(record)) {
      out[childKey] = walk(childValue, childKey, ownName, passthrough, ownText);
    }
    return out;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Placeholder SVG
// ---------------------------------------------------------------------------
const PALETTE: [string, string][] = [
  ["#0C1627", "#F5D9A8"],
  ["#1F4E4A", "#D8F0E6"],
  ["#5B3A29", "#F7E3D0"],
  ["#2E3A59", "#DCE4F7"],
  ["#6B2D5C", "#F6DCEE"],
  ["#3F4A1E", "#EAF2CF"],
];

async function writePlaceholders(): Promise<number> {
  await mkdir(MOCK_DIR, { recursive: true });
  let count = 0;

  for (let i = 1; i <= AVATAR_COUNT; i += 1) {
    const [bg, fg] = PALETTE[(i - 1) % PALETTE.length] as [string, string];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Foto profil contoh">
  <rect width="96" height="96" fill="${bg}"/>
  <circle cx="48" cy="37" r="15" fill="${fg}"/>
  <path d="M14 96c0-19 15-31 34-31s34 12 34 31z" fill="${fg}"/>
</svg>
`;
    await writeFile(path.join(MOCK_DIR, `avatar-${String(i).padStart(2, "0")}.svg`), svg);
    count += 1;
  }

  for (let i = 1; i <= MEDIA_COUNT; i += 1) {
    const [bg, fg] = PALETTE[(i - 1) % PALETTE.length] as [string, string];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="Gambar contoh">
  <defs>
    <linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${fg}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="320" fill="url(#g${i})"/>
  <circle cx="92" cy="92" r="30" fill="#ffffff" fill-opacity="0.35"/>
  <path d="M0 236l88-74 76 64 58-48 98 78v64H0z" fill="#ffffff" fill-opacity="0.26"/>
</svg>
`;
    await writeFile(path.join(MOCK_DIR, `media-${String(i).padStart(2, "0")}.svg`), svg);
    count += 1;
  }

  for (let i = 1; i <= LOGO_COUNT; i += 1) {
    const [bg, fg] = PALETTE[(i - 1) % PALETTE.length] as [string, string];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Logo contoh">
  <rect width="96" height="96" rx="20" fill="${bg}"/>
  <circle cx="48" cy="48" r="21" fill="none" stroke="${fg}" stroke-width="7"/>
  <circle cx="48" cy="48" r="7" fill="${fg}"/>
</svg>
`;
    await writeFile(path.join(MOCK_DIR, `logo-${String(i).padStart(2, "0")}.svg`), svg);
    count += 1;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const item of node) collectStrings(item, out);
  else if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectStrings(value, out);
  }
  return out;
}

const RISK_PATTERN =
  /(fbcdn|fbsbx|licdn|bsky|cloudflarestorage|cdninstagram|twimg|graph\.facebook|googleusercontent|ytimg|encrypted-tbn)/i;

async function main() {
  const raw = JSON.parse(await readFile(RAW_FILE, "utf8")) as {
    base: string;
    recordedAt: string;
    responses: Record<string, { status: number; contentType: string; json: unknown }>;
  };

  const responses: Record<string, { status: number; contentType: string; json: unknown }> = {};
  let passthroughCount = 0;
  let ownTextCount = 0;

  for (const [key, value] of Object.entries(raw.responses)) {
    const spaceAt = key.indexOf(" ");
    const endpointPath = key.slice(spaceAt + 1).split("?")[0] ?? "";
    const passthrough = PASSTHROUGH_ENDPOINT.test(endpointPath);
    const ownText = OWN_TEXT_ENDPOINT.test(endpointPath);
    if (passthrough) passthroughCount += 1;
    if (ownText) ownTextCount += 1;
    responses[key] = {
      status: value.status,
      contentType: value.contentType,
      json: walk(value.json, endpointPath, null, passthrough, ownText),
    };
  }

  const fixtures = {
    note:
      "Data fiktif untuk tangkapan layar dokumentasi /panduan dan /developers. " +
      "Dihasilkan oleh apps/web/scripts/docs-fixtures.sanitize.ts — jangan disunting manual.",
    recordedAt: raw.recordedAt,
    responses,
  };
  await writeFile(OUT_FILE, `${JSON.stringify(fixtures, null, 2)}\n`);

  const placeholders = await writePlaceholders();
  const strings = collectStrings(responses);

  // ---- Audit 1: nilai yang sudah diganti tidak boleh muncul lagi ----
  const leftovers = [...new Set(strings.filter((value) => replacedOriginals.has(value)))];

  // ---- Audit 2: sisa tautan ke penyimpanan pihak ketiga ----
  const risky = [...new Set(strings.filter((value) => RISK_PATTERN.test(value)))];

  console.log(
    `Respons        : ${Object.keys(responses).length} (${passthroughCount} endpoint dilewati apa adanya)`,
  );
  console.log(
    `Teks sendiri  : ${ownTextCount} endpoint dibiarkan utuh (${OWN_TEXT_KEYS.size} kunci: ${[...OWN_TEXT_KEYS].join(", ")})`,
  );
  console.log(`Nilai diganti  : ${replacedOriginals.size}`);
  console.log(
    `  nama ${dictionaries.size} · handle ${handleDictionary.size} · aset ${assetDictionary.size} · tautan ${linkDictionary.size} · email ${emailDictionary.size}`,
  );
  console.log(`Nilai netral   : ${keptNeutral.size} (${[...keptNeutral].join(", ") || "-"})`);
  console.log(`Placeholder    : ${placeholders} berkas SVG di public/docs/mock/`);
  console.log(`Keluar → ${path.relative(process.cwd(), OUT_FILE)}`);

  let failed = false;
  if (leftovers.length > 0) {
    failed = true;
    console.error(`\n✗ ${leftovers.length} nilai asli masih muncul di hasil sanitasi:`);
    for (const value of leftovers.slice(0, 15)) console.error(`    ${value}`);
  } else {
    console.log("\n✓ Tidak ada nilai asli yang tersisa di fixture.");
  }

  if (risky.length > 0) {
    failed = true;
    console.error(`\n✗ ${risky.length} tautan pihak ketiga masih ada:`);
    for (const value of risky.slice(0, 15)) console.error(`    ${value.slice(0, 90)}`);
  } else {
    console.log("✓ Tidak ada tautan ke penyimpanan pihak ketiga.");
  }

  console.log(`\nContoh nilai yang TIDAK diubah (${KEPT_SAMPLES.size} kunci):`);
  for (const [key, samples] of [...KEPT_SAMPLES.entries()].slice(0, 30)) {
    console.log(`    ${key.padEnd(22)} ${[...samples].join(" | ").slice(0, 95)}`);
  }

  if (failed) process.exitCode = 1;
}

await main();
