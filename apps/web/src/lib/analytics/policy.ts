/**
 * Kebijakan penyimpanan metrik per platform — disusun dari dokumentasi resmi
 * terbaru setiap platform (bukan toggle consent dari pengguna).
 *
 * Prinsip umum: sebagian besar platform memperbolehkan aplikasi menyimpan data
 * metrik AKUN SENDIRI (yang terautentikasi) untuk use case social media
 * management, dengan kewajiban minimasi data, enkripsi, dan penghapusan saat
 * diminta. Ada pengecualian yang eksplisit melarang penyimpanan (Pinterest).
 */

export type AnalyticsStoragePolicy = "ALLOWED" | "NOT_ALLOWED";

export interface PlatformStoragePolicy {
    /** Boleh tidaknya data metrik akun disimpan ke DB kita. */
    storage: AnalyticsStoragePolicy;
    /**
     * Batas maksimal menyimpan snapshot (hari), null = tanpa batas eksplisit.
     * Data lebih tua dari ini dihapus saat sinkronisasi.
     */
    retentionDays: number | null;
    /** Singkat, kenapa. */
    rationale: string;
    /** Sumber dokumentasi resmi. */
    source: string;
}

/**
 * Kebijakan per platform. Platform yang tidak terdaftar dianggap NOT_ALLOWED
 * (defensif: kalau belum diverifikasi, jangan simpan).
 */
export const PLATFORM_STORAGE_POLICIES: Record<string, PlatformStoragePolicy> = {
    INSTAGRAM: {
        storage: "ALLOWED",
        retentionDays: null,
        rationale:
            "Social media management adalah use case yang didukung Meta; data metrik akun sendiri boleh disimpan dengan minimasi data, enkripsi, dan jalur penghapusan.",
        source: "https://developers.facebook.com/docs/platform-policy/",
    },
    INSTAGRAM_PAGE: {
        storage: "ALLOWED",
        retentionDays: null,
        rationale:
            "Sama dengan INSTAGRAM — akun Business/Creator tertaut FB Page, dikelola via Meta Graph API.",
        source: "https://developers.facebook.com/docs/instagram-platform/",
    },
    FACEBOOK: {
        storage: "ALLOWED",
        retentionDays: null,
        rationale: "Meta Platform Policy mendukung penyimpanan data akun sendiri untuk SMM tools.",
        source: "https://developers.facebook.com/docs/platform-policy/",
    },
    THREADS: {
        storage: "ALLOWED",
        retentionDays: null,
        rationale:
            "Threads API adalah subset Instagram Graph API (Meta); data akun sendiri boleh disimpan.",
        source: "https://developers.facebook.com/docs/threads/",
    },
    TIKTOK: {
        storage: "ALLOWED",
        retentionDays: null,
        rationale:
            "Content Posting API hanya menyediakan data akun sendiri (/v2/user/info) tanpa analitik FYP; menyimpan data akun sendiri tidak dilarang.",
        source: "https://developers.tiktok.com/products/content-posting-api/",
    },
    YOUTUBE: {
        storage: "ALLOWED",
        retentionDays: null,
        rationale:
            "YouTube Developer Policies III.E.4: batas 30 hari berlaku untuk Non-Authorized Data. Data authorized (kanal pengguna sendiri, lewat OAuth) boleh disimpan.",
        source: "https://developers.google.com/youtube/terms/api-services-terms-of-service",
    },
    LINKEDIN: {
        storage: "ALLOWED",
        retentionDays: 365,
        rationale:
            "LinkedIn Marketing API Data Storage Requirements: Organization Pages' Admin & Reporting Data (followers, ringkasan aksi sosial, visitor info) boleh disimpan maksimal 1 tahun.",
        source: "https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements",
    },
    PINTEREST: {
        storage: "NOT_ALLOWED",
        retentionDays: null,
        rationale:
            "Developer Guidelines eksplisit: 'you may not store any information accessed through any Pinterest Materials including the API. Instead, call the API each time you need to access information.' (kecuali campaign analytics).",
        source: "https://policy.pinterest.com/en/developer-guidelines",
    },
};

/** Kebijakan default untuk platform yang tidak terdaftar — jangan disimpan. */
const DEFAULT_POLICY: PlatformStoragePolicy = {
    storage: "NOT_ALLOWED",
    retentionDays: null,
    rationale: "Kebijakan platform belum diverifikasi dari dokumentasi resmi.",
    source: "",
};

export function getPlatformStoragePolicy(platform: string): PlatformStoragePolicy {
    return PLATFORM_STORAGE_POLICIES[platform] ?? DEFAULT_POLICY;
}

export function isPlatformStorageAllowed(platform: string): boolean {
    return getPlatformStoragePolicy(platform).storage === "ALLOWED";
}