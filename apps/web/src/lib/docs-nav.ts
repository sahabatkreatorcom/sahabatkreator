// ============================================================
// Peta dokumentasi publik — SATU-SATUNYA sumber kebenaran.
//
// Dari file ini diturunkan: sidebar, tautan "sebelumnya/berikutnya",
// indeks pencarian, sitemap, dan validasi keberadaan file .mdx.
// Kalau menambah halaman: tambahkan entri di sini DAN buat file
// `src/content/<section>/<slug>.mdx`. Uji `docs-nav.test.ts` akan gagal
// bila salah satu lupa.
// ============================================================

export type DocsSectionId = "panduan" | "developers";

export type DocsPage = {
  /** "" = halaman indeks section. Selain itu nama file .mdx tanpa ekstensi. */
  slug: string;
  /** Judul di sidebar, <title>, dan breadcrumb */
  title: string;
  /** Meta description + ringkasan di kartu indeks */
  description: string;
  /** Kata kunci tambahan untuk pencarian di dalam situs */
  keywords?: string[];
};

export type DocsSection = {
  id: DocsSectionId;
  /** Prefix URL, mis. "/panduan" */
  base: string;
  /** Judul section di sidebar & breadcrumb */
  label: string;
  /** Kalimat pembuka di halaman indeks section */
  tagline: string;
  pages: DocsPage[];
};

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: "panduan",
    base: "/panduan",
    label: "Panduan Pengguna",
    tagline:
      "Langkah demi langkah memakai Sahabat Kreator: menghubungkan akun, membuat konten, menjadwalkan, sampai membaca analitik.",
    pages: [
      {
        slug: "",
        title: "Ringkasan",
        description:
          "Peta lengkap fitur Sahabat Kreator dan urutan langkah yang disarankan untuk pengguna baru.",
        keywords: ["mulai", "overview", "peta fitur", "pengguna baru"],
      },
      {
        slug: "memulai",
        title: "Memulai",
        description:
          "Membuat akun, menyelesaikan onboarding, dan mengenali tata letak dashboard Sahabat Kreator.",
        keywords: ["daftar", "registrasi", "onboarding", "dashboard", "verifikasi email"],
      },
      {
        slug: "menghubungkan-akun",
        title: "Menghubungkan Akun",
        description:
          "Cara menghubungkan Instagram, Facebook, Threads, TikTok, YouTube, dan platform lain lewat OAuth resmi.",
        keywords: [
          "oauth",
          "connect",
          "instagram",
          "facebook",
          "threads",
          "tiktok",
          "youtube",
          "page",
          "token kedaluwarsa",
        ],
      },
      {
        slug: "membuat-konten",
        title: "Membuat Konten",
        description:
          "Menulis caption, melampirkan media, membuat variasi per platform, dan memakai bantuan AI di editor konten.",
        keywords: ["compose", "caption", "hashtag", "draft", "carousel", "batas karakter"],
      },
      {
        slug: "menjadwalkan",
        title: "Menjadwalkan & Antrean",
        description:
          "Mode jadwal, saran waktu terbaik, kalender konten, dan cara kerja antrean penerbitan.",
        keywords: ["jadwal", "kalender", "queue", "antrean", "waktu terbaik", "timezone"],
      },
      {
        slug: "hasil-posting",
        title: "Hasil Posting",
        description:
          "Memantau konten yang sudah tayang, membaca tautan aslinya, dan menangani posting yang gagal.",
        keywords: ["post results", "gagal", "retry", "sinkron", "tautan post"],
      },
      {
        slug: "inbox",
        title: "Inbox & Engagement",
        description:
          "Membalas komentar dan DM dari semua platform dalam satu kotak masuk, termasuk balasan otomatis.",
        keywords: ["dm", "komentar", "balas", "engagement", "saved reply", "mention"],
      },
      {
        slug: "analitik",
        title: "Analitik & Laporan",
        description:
          "Membaca ringkasan performa, tren waktu, konten terbaik, target, dan mengekspor laporan.",
        keywords: ["analitik", "laporan", "metrik", "views", "engagement rate", "ekspor", "pdf"],
      },
      {
        slug: "riset",
        title: "Riset & Intelijen",
        description:
          "Memantau percakapan, menganalisis kompetitor, mengikuti tren, dan meriset Threads.",
        keywords: ["listening", "kompetitor", "tren", "threads", "riset"],
      },
      {
        slug: "asisten-ai",
        title: "Asisten AI",
        description:
          "Memakai Coach, SEB, dan Strategi untuk mendapatkan saran konten, audit performa, dan rencana kampanye.",
        keywords: ["ai", "coach", "seb", "strategi", "kredit ai", "saran"],
      },
      {
        slug: "media",
        title: "Media & Aset",
        description:
          "Mengunggah, mencari, dan memakai ulang aset gambar serta video dari pustaka media.",
        keywords: ["media", "upload", "gambar", "video", "format", "resize", "pustaka"],
      },
      {
        slug: "generator",
        title: "Generator & Render",
        description:
          "Membuat carousel, video, auto-clip, dan sound dari satu ide tanpa alat desain tambahan.",
        keywords: ["carousel", "video", "auto-clip", "render", "sound", "repurpose", "mp4"],
      },
      {
        slug: "automation",
        title: "Automation",
        description:
          "Menyiapkan aturan otomatis: balasan komentar, sapaan DM, dan tindakan berbasis pemicu.",
        keywords: ["automation", "aturan", "pemicu", "trigger", "auto reply"],
      },
      {
        slug: "tim",
        title: "Tim & Kolaborasi",
        description:
          "Mengundang anggota, mengatur peran dan izin, serta menyetujui konten sebelum tayang.",
        keywords: ["tim", "anggota", "peran", "role", "undangan", "approval", "kolaborasi"],
      },
      {
        slug: "langganan",
        title: "Langganan & Tagihan",
        description:
          "Melihat paket aktif, memakai kredit AI, mengganti paket, dan mengunduh riwayat pembayaran.",
        keywords: ["billing", "paket", "upgrade", "downgrade", "kredit", "qris", "invoice"],
      },
      {
        slug: "integrasi-api",
        title: "Integrasi & API",
        description:
          "Menyalakan akses API organisasi, memasang webhook, dan menghubungkan Sahabat Kreator ke MCP.",
        keywords: ["api", "webhook", "mcp", "zapier", "make", "integrasi", "api key"],
      },
      {
        slug: "pemecahan-masalah",
        title: "Pemecahan Masalah",
        description:
          "Solusi untuk masalah yang paling sering terjadi: akun terputus, posting gagal, media ditolak, notifikasi tidak masuk.",
        keywords: ["error", "gagal", "troubleshooting", "bantuan", "token", "notifikasi"],
      },
    ],
  },
  {
    id: "developers",
    base: "/developers",
    label: "Dokumentasi API",
    tagline:
      "Membangun integrasi di atas Public API v1 — autentikasi, endpoint, webhook, dan batasannya.",
    pages: [
      {
        slug: "",
        title: "Ringkasan API",
        description:
          "Gambaran Public API v1: apa yang bisa dilakukan, siapa yang boleh memakainya, dan dari mana mulai.",
        keywords: ["api", "public api", "v1", "integrasi", "openapi", "scalar"],
      },
      {
        slug: "mulai-cepat",
        title: "Mulai Cepat",
        description:
          "Dari membuat API key sampai permintaan pertama berhasil dalam lima menit, dengan contoh curl.",
        keywords: ["quickstart", "curl", "api key", "ping", "contoh"],
      },
      {
        slug: "autentikasi",
        title: "Autentikasi & Scope",
        description:
          "Bearer token, header alternatif, daftar scope per resource, dan aturan rotasi key.",
        keywords: ["auth", "bearer", "token", "scope", "api key", "rotasi", "x-api-key"],
      },
      {
        slug: "menghubungkan-akun",
        title: "Menghubungkan Akun via API",
        description:
          "Alur authorize → connect → select lengkap dengan respons polimorfik dan penanganan pendingId.",
        keywords: [
          "oauth",
          "authorize",
          "connect",
          "pending",
          "asset",
          "redirect uri",
          "developer app",
        ],
      },
      {
        slug: "webhook",
        title: "Webhook",
        description:
          "Event yang tersedia, bentuk request, verifikasi signature HMAC, retry, dan deduplikasi.",
        keywords: ["webhook", "hmac", "signature", "event", "retry", "delivery"],
      },
      {
        slug: "error-dan-batas",
        title: "Error, Rate Limit & Kredit",
        description:
          "Arti setiap status HTTP, batas 60 permintaan per menit, konsumsi kredit AI dan render, serta batasan yang diketahui.",
        keywords: ["error", "429", "rate limit", "retry-after", "kredit", "402", "batasan"],
      },
      {
        slug: "resep",
        title: "Resep Integrasi",
        description:
          "Contoh nyata: menjadwalkan post, membuat carousel, mengirim data ke Google Sheets, dan memakai MCP.",
        keywords: ["zapier", "make", "google sheets", "mcp", "resep", "contoh kode"],
      },
    ],
  },
];

export const DOCS_BY_ID: Record<DocsSectionId, DocsSection> = {
  panduan: DOCS_SECTIONS[0] as DocsSection,
  developers: DOCS_SECTIONS[1] as DocsSection,
};

/** URL lengkap sebuah halaman dokumentasi. */
export function docsHref(section: DocsSection, slug: string): string {
  return slug ? `${section.base}/${slug}` : section.base;
}

export type DocsNeighbour = { title: string; href: string };

/**
 * Halaman sebelum & sesudah dalam section yang sama, mengikuti urutan di
 * DOCS_SECTIONS. Halaman pertama tidak punya "sebelumnya", halaman terakhir
 * tidak punya "berikutnya".
 */
export function docsNeighbours(
  section: DocsSection,
  slug: string,
): { prev: DocsNeighbour | null; next: DocsNeighbour | null } {
  const index = section.pages.findIndex((page) => page.slug === slug);
  if (index === -1) return { prev: null, next: null };
  const before = section.pages[index - 1];
  const after = section.pages[index + 1];
  return {
    prev: before ? { title: before.title, href: docsHref(section, before.slug) } : null,
    next: after ? { title: after.title, href: docsHref(section, after.slug) } : null,
  };
}

/** Section yang memiliki base path cocok dengan sebuah pathname, bila ada. */
export function docsSectionForPath(pathname: string): DocsSection | null {
  return (
    DOCS_SECTIONS.find(
      (section) => pathname === section.base || pathname.startsWith(`${section.base}/`),
    ) ?? null
  );
}

/** Slug halaman dari sebuah pathname di dalam section. */
export function docsSlugForPath(section: DocsSection, pathname: string): string {
  if (pathname === section.base) return "";
  return pathname.slice(section.base.length + 1);
}

/**
 * Daftar URL dokumentasi untuk sitemap.xml.
 * Halaman indeks section didahulukan, lalu seluruh halaman lain berurutan.
 */
export function docsSitemapEntries(): Array<{ path: string; priority: number }> {
  const entries: Array<{ path: string; priority: number }> = [];
  for (const section of DOCS_SECTIONS) {
    section.pages.forEach((page, index) => {
      entries.push({
        path: docsHref(section, page.slug),
        priority: index === 0 ? 0.7 : 0.6,
      });
    });
  }
  return entries;
}

// ---------- Pencarian ----------

export type DocsSearchEntry = {
  title: string;
  href: string;
  sectionLabel: string;
  description: string;
  haystack: string;
};

/** Indeks pencarian sederhana di sisi klien — dibangun dari DOCS_SECTIONS. */
export function docsSearchIndex(): DocsSearchEntry[] {
  return DOCS_SECTIONS.flatMap((section) =>
    section.pages.map((page) => ({
      title: page.title,
      href: docsHref(section, page.slug),
      sectionLabel: section.label,
      description: page.description,
      haystack: [page.title, page.description, ...(page.keywords ?? []), section.label]
        .join(" ")
        .toLowerCase(),
    })),
  );
}

/**
 * Pencarian sederhana: setiap kata pada query harus muncul di haystack.
 * Cukup untuk ~25 halaman; tidak perlu pustaka indeks penuh.
 */
export function searchDocs(query: string, limit = 8): DocsSearchEntry[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return [];
  return docsSearchIndex()
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .slice(0, limit);
}
