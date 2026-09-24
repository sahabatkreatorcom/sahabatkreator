// Tipe bersama untuk halaman Compose & sub-komponennya

export type Account = {
  id: string;
  platform: string;
  /** ID akun di platform (mis. Page ID Facebook) — dipakai untuk mention/tag */
  platformAccountId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isConnected: boolean;
  /** Akun diterbitkan via bridge Repliz (bukan API native) — batasan fitur berbeda */
  isBridge?: boolean;
};

export type MediaItem = {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  name?: string;
  width?: number | null;
  height?: number | null;
  /** Durasi video dalam detik — null bila bukan video / tidak diketahui */
  durationSeconds?: number | null;
  /** Thumbnail video (JPEG frame) — null bila bukan video/tidak tersedia */
  thumbnailUrl?: string | null;
};

/** Opsi resize cepat per platform — dimensi ditangani server (sharp) */
export const RESIZE_PRESETS = [
  { platform: "instagram", postType: "feed" as const, label: "IG Feed 4:5" },
  { platform: "instagram", postType: "story" as const, label: "IG Story 9:16" },
  { platform: "tiktok", label: "TikTok 9:16" },
  { platform: "youtube", label: "YouTube 16:9" },
  { platform: "linkedin", label: "LinkedIn 1.91:1" },
  { platform: "linkedin_org", label: "LinkedIn Page 1.91:1" },
] as const;

/** Sound track terpilih untuk konten video (TikTok/Reels) — dari /sound library */
export type SoundTrack = {
  id: string;
  name: string;
  url: string;
  durationSeconds: number;
  waveformData: number[] | null;
  isFeatured: boolean;
  category: string | null;
};

/** Batas karakter per platform */
export const CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  x: 280,
  linkedin: 3000,
  linkedin_org: 3000,
  tiktok: 2200,
  youtube: 5000,
  threads: 500,
  pinterest: 500,
  manual: 5000,
};

/** Default jadwal: besok jam 09:00 (format datetime-local) */
export function defaultScheduledAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
