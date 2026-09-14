// Fetch layer posts-sync — ambil daftar konten terbit dari tiap platform.
// Post eksternal = dipublikasikan langsung di platform (bukan via Sahabat Kreator),
// diimpor agar kalender & analytics menampilkan konten lengkap.
// Dipakai oleh posts-sync.ts (orchestration). Semua request lewat httpRequest
// (timeout + retry 429/5xx + backoff).

import { META_GRAPH_VERSION } from "./config";
import { httpRequest } from "./http";

const GRAPH_VERSION = META_GRAPH_VERSION;
const GRAPH_FB = `https://graph.facebook.com/${GRAPH_VERSION}`;
/** IG standalone (Instagram API with Instagram Login) — host graph.instagram.com */
export const GRAPH_IG = `https://graph.instagram.com/${GRAPH_VERSION}`;

/** Item konten eksternal hasil fetch (bentuk normal dari semua platform) */
export type ExternalPost = {
  externalId: string;
  caption: string;
  /** IMAGE | VIDEO | CAROUSEL | REEL | STORY */
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL" | "REEL" | "STORY";
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink: string;
  publishedAt: Date;
};

export type FetchResult = { ok: true; data: ExternalPost[] } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

// ---------------------------------------------------------------------------
// Instagram (media + stories) — graph.facebook.com (jalur Page) atau
// graph.instagram.com (jalur standalone; host dipilih caller)
// ---------------------------------------------------------------------------

function mapIgMediaType(igType: string): ExternalPost["mediaType"] {
  switch (igType) {
    case "VIDEO":
      return "VIDEO";
    case "CAROUSEL_ALBUM":
      return "CAROUSEL";
    case "REELS":
      return "REEL";
    default:
      return "IMAGE";
  }
}

/** Media terbaru IG Business account (filter `since` client-side — API tidak dukung). */
export async function getInstagramMedia(
  accessToken: string,
  igUserId: string,
  base = GRAPH_FB,
  since?: Date,
  limit = 50,
): Promise<FetchResult> {
  try {
    const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
    const res = await httpRequest<{
      data?: Array<{
        id: string;
        caption?: string;
        media_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp?: string;
      }>;
    }>(`${base}/${igUserId}/media`, {
      query: { fields, limit, access_token: accessToken },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `IG media: HTTP ${res.status} ${text.slice(0, 150)}` };
    }
    const data = (await res.json()).data ?? [];
    const posts: ExternalPost[] = [];
    for (const item of data) {
      if (!item.id || !item.timestamp) continue;
      const publishedAt = new Date(item.timestamp);
      if (since && publishedAt < since) continue;
      posts.push({
        externalId: item.id,
        caption: item.caption ?? "",
        mediaType: mapIgMediaType(item.media_type ?? ""),
        mediaUrl: item.media_url,
        thumbnailUrl: item.thumbnail_url ?? item.media_url,
        permalink: item.permalink ?? "",
        publishedAt,
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}

/** Stories aktif IG (umur 24 jam — tidak termasuk endpoint /media). */
export async function getInstagramStories(
  accessToken: string,
  igUserId: string,
  base = GRAPH_FB,
): Promise<FetchResult> {
  try {
    const fields = "id,media_type,media_url,thumbnail_url,permalink,timestamp";
    const res = await httpRequest<{
      data?: Array<{
        id: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp?: string;
      }>;
    }>(`${base}/${igUserId}/stories`, {
      query: { fields, access_token: accessToken },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `IG stories: HTTP ${res.status} ${text.slice(0, 150)}` };
    }
    const data = (await res.json()).data ?? [];
    const posts: ExternalPost[] = [];
    for (const item of data) {
      if (!item.id || !item.timestamp) continue;
      posts.push({
        externalId: item.id,
        caption: "", // stories tanpa caption di response API
        mediaType: "STORY",
        mediaUrl: item.media_url,
        thumbnailUrl: item.thumbnail_url ?? item.media_url,
        permalink: item.permalink ?? "",
        publishedAt: new Date(item.timestamp),
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Facebook Page (published_posts + stories)
// ---------------------------------------------------------------------------

/** Post terbit dari Page Facebook. */
export async function getFacebookPagePosts(
  accessToken: string,
  pageId: string,
  since?: Date,
  limit = 50,
): Promise<FetchResult> {
  try {
    const fields = "id,message,full_picture,permalink_url,created_time";
    const query: Record<string, string | number | boolean | undefined> = {
      fields,
      limit,
      access_token: accessToken,
    };
    if (since) query.since = Math.floor(since.getTime() / 1000);
    const res = await httpRequest<{
      data?: Array<{
        id: string;
        message?: string;
        full_picture?: string;
        permalink_url?: string;
        created_time?: string;
      }>;
    }>(`${GRAPH_FB}/${pageId}/published_posts`, { query });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `FB posts: HTTP ${res.status} ${text.slice(0, 150)}` };
    }
    const data = (await res.json()).data ?? [];
    const posts: ExternalPost[] = [];
    for (const item of data) {
      if (!item.id || !item.created_time) continue;
      posts.push({
        externalId: item.id,
        caption: item.message ?? "",
        mediaType: "IMAGE",
        thumbnailUrl: item.full_picture,
        permalink: item.permalink_url ?? "",
        publishedAt: new Date(item.created_time),
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}

/** Stories aktif Page Facebook (best-effort — Page tanpa tab stories diabaikan). */
export async function getFacebookPageStories(
  accessToken: string,
  pageId: string,
): Promise<FetchResult> {
  try {
    const fields = "id,media_type,url,permalink_url,created_time";
    const res = await httpRequest<{
      data?: Array<{
        id: string;
        url?: string;
        permalink_url?: string;
        created_time?: string;
      }>;
    }>(`${GRAPH_FB}/${pageId}/stories`, {
      query: { fields, access_token: accessToken },
    });
    if (!res.ok) {
      // Page tanpa stories aktif adalah kasus normal — bukan error keras
      return { ok: true, data: [] };
    }
    const data = (await res.json()).data ?? [];
    const posts: ExternalPost[] = [];
    for (const item of data) {
      if (!item.id || !item.created_time) continue;
      posts.push({
        externalId: item.id,
        caption: "",
        mediaType: "STORY",
        thumbnailUrl: item.url,
        permalink: item.permalink_url ?? `https://facebook.com/stories/${item.id}`,
        publishedAt: new Date(item.created_time),
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// TikTok — video list (butuh scope video.list)
// ---------------------------------------------------------------------------

export async function getTikTokVideos(
  accessToken: string,
  since?: Date,
  limit = 20,
): Promise<FetchResult> {
  try {
    // TikTok mewajibkan fields eksplisit di query
    const fields = "id,title,create_time,cover_image_url,share_url";
    const res = await httpRequest<{
      data?: {
        videos?: Array<{
          id: string;
          title?: string;
          create_time?: number;
          cover_image_url?: string;
          share_url?: string;
        }>;
      };
      error?: { code?: string; message?: string };
    }>("https://open.tiktokapis.com/v2/video/list/", {
      method: "POST",
      query: { fields },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ max_count: limit }),
      retries: 1,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `TikTok videos: HTTP ${res.status} ${text.slice(0, 150)}` };
    }
    const body = await res.json();
    if (body.error?.message && body.error.code !== "ok") {
      return { ok: false, error: `TikTok: ${body.error.message}` };
    }
    const videos = body.data?.videos ?? [];
    const posts: ExternalPost[] = [];
    for (const item of videos) {
      if (!item.id || !item.create_time) continue;
      const publishedAt = new Date(item.create_time * 1000);
      if (since && publishedAt < since) continue;
      posts.push({
        externalId: item.id,
        caption: item.title ?? "",
        mediaType: "VIDEO",
        thumbnailUrl: item.cover_image_url,
        permalink: item.share_url ?? "",
        publishedAt,
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// YouTube — uploads playlist channel
// ---------------------------------------------------------------------------

export async function getYouTubeVideos(
  accessToken: string,
  channelId: string,
  since?: Date,
  limit = 50,
): Promise<FetchResult> {
  try {
    // Ambil uploads playlist ID dari channel
    const chRes = await httpRequest<{
      items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
    }>("https://www.googleapis.com/youtube/v3/channels", {
      query: { part: "contentDetails", id: channelId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!chRes.ok) {
      const text = await chRes.text().catch(() => "");
      return { ok: false, error: `YT channel: HTTP ${chRes.status} ${text.slice(0, 150)}` };
    }
    const uploadsPlaylistId = (await chRes.json()).items?.[0]?.contentDetails?.relatedPlaylists
      ?.uploads;
    if (!uploadsPlaylistId) {
      return { ok: false, error: "Uploads playlist channel tidak ditemukan" };
    }

    const query: Record<string, string | number | boolean | undefined> = {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: limit,
    };
    if (since) query.publishedAfter = since.toISOString();
    const res = await httpRequest<{
      items?: Array<{
        id: string;
        contentDetails?: { videoId?: string };
        snippet?: {
          title?: string;
          publishedAt?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }>;
    }>("https://www.googleapis.com/youtube/v3/playlistItems", {
      query,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `YT playlist: HTTP ${res.status} ${text.slice(0, 150)}` };
    }
    const items = (await res.json()).items ?? [];
    const posts: ExternalPost[] = [];
    for (const item of items) {
      const videoId = item.contentDetails?.videoId;
      const publishedAt = item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null;
      if (!videoId || !publishedAt || Number.isNaN(publishedAt.getTime())) continue;
      posts.push({
        externalId: videoId,
        caption: item.snippet?.title ?? "",
        mediaType: "VIDEO",
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
        permalink: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Pinterest — pins user
// ---------------------------------------------------------------------------

export async function getPinterestPins(
  accessToken: string,
  since?: Date,
  limit = 50,
): Promise<FetchResult> {
  try {
    const res = await httpRequest<{
      items?: Array<{
        id: string;
        title?: string;
        description?: string;
        created_at?: string;
        media?: { images?: Record<string, { url?: string }> };
      }>;
      message?: string;
    }>("https://api.pinterest.com/v5/pins", {
      query: { page_size: limit },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Pinterest pins: HTTP ${res.status} ${text.slice(0, 150)}` };
    }
    const items = (await res.json()).items ?? [];
    const posts: ExternalPost[] = [];
    for (const item of items) {
      if (!item.id || !item.created_at) continue;
      const publishedAt = new Date(item.created_at);
      if (since && publishedAt < since) continue;
      posts.push({
        externalId: item.id,
        caption: item.title ?? item.description ?? "",
        mediaType: "IMAGE",
        thumbnailUrl: item.media?.images?.["600x"]?.url,
        permalink: `https://pinterest.com/pin/${item.id}`,
        publishedAt,
      });
    }
    return { ok: true, data: posts };
  } catch (error) {
    return fail(error);
  }
}
