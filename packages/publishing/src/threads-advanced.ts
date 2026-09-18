// Operasi lanjutan Threads API (advanced access — App Review per izin):
// - delete post       → threads_delete        (limit 100/24 jam)
// - keyword search    → threads_keyword_search (limit 500/7 hari)
// - location search   → threads_location_tagging (limit 500/24 jam)
// - mentions          → threads_manage_mentions
// - profile discovery → threads_profile_discovery
//
// Riset: docs/social-platforms/threads.md. Semua endpoint di host graph.threads.net.
// Dipakai oleh admin API-test trigger + (menyusul) UI. Scope di platform-configs.ts.

import { GRAPH_THREADS_URL } from "./config";
import { httpRequest } from "./http";
import { PublishError } from "./types";

const GRAPH_THREADS = GRAPH_THREADS_URL;

/** Field standar objek post/reply/mention Threads */
const POST_FIELDS =
  "id,text,username,permalink,timestamp,media_type,has_replies,is_reply,is_quote_post";

/**
 * Path endpoint Profile Discovery — mengikuti reference "Threads Profile Discovery".
 * Bila Graph menolak (404/path berubah), ubah konstanta ini tanpa menyentuh pemanggil.
 */
const PROFILE_SEARCH_PATH = "profile_search";

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
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export type ThreadsProfile = {
  id: string;
  username?: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count?: number;
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
    retries: 1,
  });
  if (!res.ok) await throwThreadsError(res, "Hapus post Threads");
}

/**
 * Cari post publik berdasarkan keyword.
 * `GET /{threads-user-id}/keyword_search?q=&search_type=TOP|RECENT` — scope `threads_keyword_search`.
 */
export async function searchThreadsKeywords(input: {
  accessToken: string;
  userId: string;
  query: string;
  searchType?: "TOP" | "RECENT";
  limit?: number;
}): Promise<ThreadsPost[]> {
  const res = await httpRequest<{ data?: ThreadsPost[] }>(
    `${GRAPH_THREADS}/${input.userId}/keyword_search`,
    {
      query: {
        q: input.query,
        search_type: input.searchType ?? "TOP",
        fields: POST_FIELDS,
        limit: input.limit ?? 25,
        access_token: input.accessToken,
      },
      retries: 1,
    },
  );
  if (!res.ok) await throwThreadsError(res, "Threads keyword search");
  return (await res.json()).data ?? [];
}

/**
 * Cari lokasi untuk di-tag saat publish.
 * `GET /{threads-user-id}/location_search` dengan `q` ATAU `latitude`+`longitude`.
 * Scope `threads_location_tagging`.
 */
export async function searchThreadsLocations(input: {
  accessToken: string;
  userId: string;
  query?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
}): Promise<ThreadsLocation[]> {
  const res = await httpRequest<{ data?: ThreadsLocation[] }>(
    `${GRAPH_THREADS}/${input.userId}/location_search`,
    {
      query: {
        q: input.query,
        latitude: input.latitude,
        longitude: input.longitude,
        fields: "id,name,address,latitude,longitude",
        limit: input.limit ?? 25,
        access_token: input.accessToken,
      },
      retries: 1,
    },
  );
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
      retries: 1,
    },
  );
  if (!res.ok) await throwThreadsError(res, "Threads mentions");
  return (await res.json()).data ?? [];
}

/**
 * Cari profil publik + post publik akun lain (riset kompetitor/discovery).
 * Scope `threads_profile_discovery`.
 */
export async function discoverThreadsProfiles(input: {
  accessToken: string;
  userId: string;
  query: string;
  limit?: number;
}): Promise<ThreadsProfile[]> {
  const res = await httpRequest<{ data?: ThreadsProfile[] }>(
    `${GRAPH_THREADS}/${input.userId}/${PROFILE_SEARCH_PATH}`,
    {
      query: {
        q: input.query,
        fields: "id,username,name,biography,profile_picture_url,followers_count",
        limit: input.limit ?? 25,
        access_token: input.accessToken,
      },
      retries: 1,
    },
  );
  if (!res.ok) await throwThreadsError(res, "Threads profile discovery");
  return (await res.json()).data ?? [];
}
