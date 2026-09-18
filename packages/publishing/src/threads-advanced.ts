// Operasi lanjutan Threads API (advanced access — App Review per izin):
// - delete post       → threads_delete        (limit 100/24 jam)
// - keyword search    → threads_keyword_search (limit 500/7 hari)
// - location search   → threads_location_tagging (limit 500/24 jam)
// - mentions          → threads_manage_mentions
// - profile discovery → threads_profile_discovery (lookup username persis)
//
// Referensi (endpoint root-level, bukan di bawah /{user-id}):
// - GET /keyword_search?q=&search_type=TOP|RECENT
// - GET /location_search?query=&fields=
// - GET /{threads-user-id}/mentions
// - GET /profile_lookup?username=  &  GET /profile_posts?username=
// Riset: docs/social-platforms/threads.md + Meta Threads API reference.

import { GRAPH_THREADS_URL } from "./config";
import { httpRequest } from "./http";
import { PublishError } from "./types";

const GRAPH_THREADS = GRAPH_THREADS_URL;

/** Field standar objek post/reply/mention Threads */
const POST_FIELDS =
  "id,text,username,permalink,timestamp,media_type,has_replies,is_reply,is_quote_post";

// profile_posts tidak mendukung field milik reply (`has_replies`/`is_reply`)
const PROFILE_POST_FIELDS =
  "id,text,username,permalink,timestamp,media_type,is_quote_post,topic_tag";

const LOCATION_FIELDS = "id,name,address,city,country,latitude,longitude,postal_code";

// Timeout pendek + tanpa retry network: bila Graph menggantung, kita kembalikan
// pesan error sendiri dengan cepat (< timeout proxy) alih-alih 502 mentah.
const THREADS_TIMEOUT_MS = 15_000;

export type ThreadsPost = {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  has_replies?: boolean;
  is_reply?: boolean;
  is_quote_post?: boolean;
};

export type ThreadsLocation = {
  id: string;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  postal_code?: string | null;
};

// Catatan: field profile_lookup BEDA dari profil /me — di sini `profile_picture_url`
// dan `biography` (bukan `threads_*`), plus follower_count.
export type ThreadsProfile = {
  username?: string;
  name?: string;
  profile_picture_url?: string;
  biography?: string;
  follower_count?: number;
  is_verified?: boolean;
};

/** Lempar PublishError dari response non-2xx Threads (retryable untuk 429/5xx) */
async function throwThreadsError(res: Awaited<ReturnType<typeof httpRequest>>, context: string) {
  const body = await res.text().catch(() => "");
  throw new PublishError(
    "threads_api_failed",
    `${context} (${res.status}): ${body.slice(0, 250)}`,
    res.status === 429 || res.status >= 500,
  );
}

/**
 * Hapus post Threads milik sendiri.
 * `DELETE /{threads-media-id}` — scope `threads_delete`.
 */
export async function deleteThreadsPost(input: {
  accessToken: string;
  mediaId: string;
}): Promise<void> {
  const res = await httpRequest<{ success?: boolean }>(`${GRAPH_THREADS}/${input.mediaId}`, {
    method: "DELETE",
    query: { access_token: input.accessToken },
    retries: 0,
    timeoutMs: THREADS_TIMEOUT_MS,
  });
  if (!res.ok) await throwThreadsError(res, "Hapus post Threads");
}

/**
 * Cari post publik berdasarkan keyword/topic tag.
 * `GET /keyword_search` (root-level) — scope `threads_keyword_search`.
 */
export async function searchThreadsKeywords(input: {
  accessToken: string;
  query: string;
  searchType?: "TOP" | "RECENT";
  searchMode?: "KEYWORD" | "TAG";
  limit?: number;
}): Promise<ThreadsPost[]> {
  const res = await httpRequest<{ data?: ThreadsPost[] }>(`${GRAPH_THREADS}/keyword_search`, {
    query: {
      q: input.query,
      search_type: input.searchType ?? "TOP",
      search_mode: input.searchMode,
      fields: POST_FIELDS,
      limit: input.limit ?? 25,
      access_token: input.accessToken,
    },
    retries: 0,
    timeoutMs: THREADS_TIMEOUT_MS,
  });
  if (!res.ok) await throwThreadsError(res, "Threads keyword search");
  return (await res.json()).data ?? [];
}

/**
 * Cari lokasi untuk di-tag saat publish.
 * `GET /location_search` (root-level) dengan `query` atau `latitude`+`longitude`.
 * Scope `threads_location_tagging`.
 */
export async function searchThreadsLocations(input: {
  accessToken: string;
  query?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
}): Promise<ThreadsLocation[]> {
  const send = (param: "query" | "q") =>
    httpRequest<{ data?: ThreadsLocation[] }>(`${GRAPH_THREADS}/location_search`, {
      query: {
        [param]: input.query,
        latitude: input.latitude,
        longitude: input.longitude,
        fields: LOCATION_FIELDS,
        limit: input.limit ?? 25,
        access_token: input.accessToken,
      },
      retries: 0,
      timeoutMs: THREADS_TIMEOUT_MS,
    });

  // Referensi resmi Meta: parameter `query` (Optional) + latitude/longitude.
  // `q` hanya fallback bila Graph menolak dengan 400.
  let res = await send("query");
  if (!res.ok && res.status === 400) res = await send("q");
  if (!res.ok) await throwThreadsError(res, "Threads location search");
  return (await res.json()).data ?? [];
}

/**
 * Ambil post/reply di mana akun kita di-mention.
 * `GET /{threads-user-id}/mentions` — scope `threads_manage_mentions`.
 */
export async function getThreadsMentions(input: {
  accessToken: string;
  userId: string;
  limit?: number;
}): Promise<ThreadsPost[]> {
  const res = await httpRequest<{ data?: ThreadsPost[] }>(
    `${GRAPH_THREADS}/${input.userId}/mentions`,
    {
      query: {
        fields: POST_FIELDS,
        limit: input.limit ?? 25,
        access_token: input.accessToken,
      },
      retries: 0,
      timeoutMs: THREADS_TIMEOUT_MS,
    },
  );
  if (!res.ok) await throwThreadsError(res, "Threads mentions");
  return (await res.json()).data ?? [];
}

/**
 * Lookup profil publik berdasarkan **username persis** (Threads API tidak
 * menyediakan pencarian profil per keyword).
 * `GET /profile_lookup?username=` — scope `threads_profile_discovery`.
 */
export async function lookupThreadsProfile(input: {
  accessToken: string;
  username: string;
}): Promise<ThreadsProfile | null> {
  const res = await httpRequest<ThreadsProfile | { data?: ThreadsProfile[] }>(
    `${GRAPH_THREADS}/profile_lookup`,
    {
      query: {
        username: input.username.replace(/^@/, ""),
        fields: "username,name,profile_picture_url,biography,follower_count,is_verified",
        access_token: input.accessToken,
      },
      retries: 0,
      timeoutMs: THREADS_TIMEOUT_MS,
    },
  );
  if (!res.ok) await throwThreadsError(res, "Threads profile lookup");
  const body = await res.json();
  const data = (body as { data?: ThreadsProfile[] }).data;
  if (Array.isArray(data)) return data[0] ?? null;
  return (body as ThreadsProfile) ?? null;
}

/**
 * Ambil post publik sebuah profil.
 * `GET /profile_posts?username=` — scope `threads_profile_discovery`.
 */
export async function getThreadsProfilePosts(input: {
  accessToken: string;
  username: string;
  limit?: number;
}): Promise<ThreadsPost[]> {
  const res = await httpRequest<{ data?: ThreadsPost[] }>(`${GRAPH_THREADS}/profile_posts`, {
    query: {
      username: input.username.replace(/^@/, ""),
      fields: PROFILE_POST_FIELDS,
      limit: input.limit ?? 25,
      access_token: input.accessToken,
    },
    retries: 0,
    timeoutMs: THREADS_TIMEOUT_MS,
  });
  if (!res.ok) await throwThreadsError(res, "Threads profile posts");
  return (await res.json()).data ?? [];
}
