// Tipe bersama untuk halaman Compose & sub-komponennya

export type Account = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isConnected: boolean;
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
};

/** Opsi resize cepat per platform — dimensi ditangani server (sharp) */
export const RESIZE_PRESETS = [
  { platform: "instagram", postType: "feed" as const, label: "IG Feed 4:5" },
  { platform: "instagram", postType: "story" as const, label: "IG Story 9:16" },
  { platform: "tiktok", label: "TikTok 9:16" },
  { platform: "youtube", label: "YouTube 16:9" },
  { platform: "linkedin", label: "LinkedIn 1.91:1" },
] as const;

/** Batas karakter per platform */
export const CHAR_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  x: 280,
  linkedin: 3000,
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
