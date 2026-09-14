// Core types publishing — kontrak antara pipeline, adapter, dan worker
// Token TIDAK disimpan di sini (dipass dari caller yang sudah mendekripsi).

/** Media terlampir ke post (URL publik dari R2) */
export type PublishMedia = {
  url: string;
  type: "image" | "video" | "audio";
  mimeType: string;
  altText?: string | null;
};

/** Input untuk adapter platform */
export type PublishInput = {
  /** Token akses plaintext (sudah didekripsi caller) */
  accessToken: string;
  /** Refresh token plaintext (bila ada, untuk platform rotating token) */
  refreshToken?: string | null;
  /** ID akun di platform (IG user id, FB page id, dst.) */
  platformAccountId: string;
  /** Konten final (caption/description) */
  content: string;
  /** Hashtag terpisah (akan digabung ke konten oleh adapter bila perlu) */
  hashtags: string[];
  /** Media terlampir (URL publik — Meta/TikTok butuh URL, bukan binary) */
  media: PublishMedia[];
  /** Settings khusus platform (tiktok privacy, youtube category, dll.) */
  platformSettings: Record<string, unknown>;
};

/** Hasil sukses publish */
export type PublishResult =
  | {
      status: "published";
      /** ID konten di platform */
      platformPostId: string;
      /** URL konten di platform (bila tersedia) */
      platformPostUrl?: string | null;
      /** True bila platform yang menjadwalkan tayang (FB scheduled_publish_time, YT publishAt, GBP scheduledTime) */
      scheduledOnPlatform?: boolean;
      /** Token baru hasil rotasi (Pinterest/TikTok) — caller wajib persist */
      rotatedTokens?: { accessToken?: string; refreshToken?: string };
    }
  | {
      /** Publish diterima platform tapi masih diproses (TikTok, YT upload, IG container) — poll via checkStatus */
      status: "processing";
      /** Handle untuk polling status (publish_id, upload session, container id) */
      handle: string;
      rotatedTokens?: { accessToken?: string; refreshToken?: string };
    };

/** Error publish terjadi retryable vs permanen */
export class PublishError extends Error {
  constructor(
    public code: string,
    message: string,
    /** true = boleh retry (network, 429, 5xx); false = jangan retry (konten ditolak, token invalid) */
    public retryable: boolean,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

/** Status async saat polling */
export type AsyncPostStatus =
  | { status: "processing" }
  | { status: "published"; platformPostId: string; platformPostUrl?: string | null }
  | { status: "failed"; code: string; message: string; retryable: boolean };

/** Kontrak adapter per platform */
export type PlatformAdapter = {
  /** Nama platform (match enum db) */
  platform: string;
  /** Publish konten. TIDAK boleh melakukan sleep/polling internal — return "processing" untuk flow async. */
  publish(input: PublishInput): Promise<PublishResult>;
  /** Cek status post async (TikTok/YT/IG container). Adapter tanpa flow async → undefined. */
  checkStatus?(input: {
    accessToken: string;
    platformAccountId: string;
    handle: string;
    /** Data post dari DB — dibutuhkan Pinterest video untuk membuat pin final */
    content?: string;
    hashtags?: string[];
    platformSettings?: Record<string, unknown>;
  }): Promise<AsyncPostStatus>;
};

/** Limit publish aman per platform per 24 jam (dari riset docs/social-platforms) */
export const PLATFORM_DAILY_LIMITS: Record<string, number> = {
  instagram: 50, // limit resmi 100, pakai 50 sebagai batas aman
  instagram_standalone: 50,
  facebook: 50, // BUC-based; batas aman konservatif
  threads: 250,
  tiktok: 15, // ~15–25 shared antar app → paling konservatif
  youtube: 50, // bucket ~100/hari; aman di bawah
  pinterest: 100, // trial 300/hari → aman
  linkedin: 50, // member 150/hari → aman
  bluesky: 200, // 5.000 poin/jam ÷ 3 = ~1.666/jam; konservatif per hari
  google_business: 100,
  manual: 0,
};

/** Hitung caption final: konten + hashtag (dipakai adapter yang butuh satu string) */
export function composeCaption(content: string, hashtags: string[]): string {
  const tagString = hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  if (!tagString) return content;
  return content.includes(tagString) ? content : `${content}\n\n${tagString}`;
}
