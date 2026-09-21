// Add-on API — link metadata (Premium+) dan musik TikTok.
// Docs: docs/repliz/Addon/

import { type ReplizCredentials, replizRequest } from "./shared";

/** Open Graph metadata URL (GET /public/link/metadata). */
export type ReplizLinkMetadata = {
  title?: string;
  description?: string;
  image?: string;
  url: string;
};

/** Ambil Open Graph metadata sebuah URL (GET /public/link/metadata). */
export async function replizGetLinkMetadata(
  cred: ReplizCredentials,
  url: string,
): Promise<ReplizLinkMetadata | null> {
  const data = await replizRequest<Record<string, unknown>>(cred, "/public/link/metadata", {
    query: { url },
  });
  if (!data || (!data.title && !data.url)) return null;
  return {
    title: data.title ? String(data.title) : undefined,
    description: data.description ? String(data.description) : undefined,
    image: data.image ? String(data.image) : undefined,
    url: data.url ? String(data.url) : url,
  };
}

/** Musik trending TikTok (GET /public/tiktok/music) */
export type ReplizTiktokMusic = {
  id: string;
  artist: string;
  name: string;
  thumbnail?: string;
  duration?: number;
  url?: string;
};

/** Genre yang didukung filter musik TikTok (docs: 107 opsi; ini subset populer) */
export type ReplizTiktokMusicGenre =
  | "ALL"
  | "ROCK"
  | "POP"
  | "LATIN"
  | "METAL"
  | "ELECTRONIC"
  | "HIP_HOP/RAP"
  | "ALTERNATIVE/INDIE";

export type ReplizTiktokMusicDateRange = "1DAY" | "7DAY" | "30DAY" | "90DAY";

/**
 * Browse musik trending TikTok (GET /public/tiktok/music).
 * `genre` & `countryCode` & `dateRange` wajib diisi (docs: required).
 */
export async function replizListTiktokMusic(
  cred: ReplizCredentials,
  opts: {
    genre: ReplizTiktokMusicGenre;
    countryCode: string;
    dateRange: ReplizTiktokMusicDateRange;
  },
): Promise<ReplizTiktokMusic[]> {
  const data = await replizRequest<{
    docs?: Array<Record<string, unknown>>;
  }>(cred, "/public/tiktok/music", {
    query: {
      genre: opts.genre,
      countryCode: opts.countryCode,
      dateRange: opts.dateRange,
    },
  });

  return (data?.docs ?? []).map((d) => ({
    id: String(d.id ?? d._id),
    artist: String(d.artist ?? ""),
    name: String(d.name ?? ""),
    thumbnail: d.thumbnail ? String(d.thumbnail) : undefined,
    duration: typeof d.duration === "number" ? d.duration : undefined,
    url: d.url ? String(d.url) : undefined,
  }));
}
