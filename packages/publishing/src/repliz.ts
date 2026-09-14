// Repliz API client — bridge publish sebelum akses API native platform disetujui.
// Docs: https://docs.repliz.com/api/introduction.html
// Auth: Basic (AccessKey:SecretKey), disimpan terenkripsi di tabel bridge_config.
// Tier syarat: OAuth Connect APIs + Chat/Content = Gold+; Schedule = Premium+.

import { httpRequest, throwFromResponse, type HttpResponse } from "./http";
import { PublishError } from "./types";

const API_BASE = "https://api.repliz.com";

/** Platform yang didukung bridge Repliz (mapping enum platform kita → type akun Repliz) */
export const REPLIZ_PLATFORMS = {
  facebook: "facebook",
  instagram: "instagram",
  instagram_standalone: "instagram",
  threads: "threads",
  tiktok: "tiktok",
  youtube: "youtube",
  linkedin: "linkedin",
} as const;

export type ReplizPlatformKey = keyof typeof REPLIZ_PLATFORMS;
export const REPLIZ_SUPPORTED: readonly string[] = Object.keys(REPLIZ_PLATFORMS);

/** Kredensial Repliz (secret sudah plaintext — caller bertanggung jawab decrypt) */
export type ReplizCredentials = {
  accessKey: string;
  secretKey: string;
};

/** Akun sosial di workspace Repliz (GET /public/account) */
export type ReplizAccount = {
  id: string;
  generatedId: string;
  name: string;
  username: string;
  picture?: string;
  isConnected: boolean;
  type: string;
};

/** Page Facebook hasil get-page (berisi page access token) */
export type ReplizPage = {
  id: string;
  name: string;
  username?: string;
  picture?: string;
  token: string;
};

/** Status schedule Repliz: pending → process → success | error */
export type ReplizScheduleStatus = "pending" | "process" | "error" | "success";

export type ReplizSchedule = {
  id: string;
  status: ReplizScheduleStatus;
  /** Post ID asli platform (terisi setelah success) */
  postId?: string;
  scheduleAt: string;
  type: string;
  accountId: string;
};

/** Media untuk createSchedule */
export type ReplizMedia = {
  alt?: string;
  type: "image" | "video";
  thumbnail?: string;
  url: string;
};

export type ReplizScheduleInput = {
  title?: string;
  description: string;
  type: "text" | "image" | "video" | "reel" | "album" | "link" | "story";
  medias: ReplizMedia[];
  accountId: string;
  scheduleAt: string; // ISO 8601
  topic?: string;
  tags?: string[];
};

function basicAuthHeader(cred: ReplizCredentials): string {
  return `Basic ${Buffer.from(`${cred.accessKey}:${cred.secretKey}`).toString("base64")}`;
}

/** Wrapper request dengan Basic Auth + error mapping ke PublishError */
async function replizRequest<T>(
  cred: ReplizCredentials,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const res: HttpResponse<T> = await httpRequest<T>(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: basicAuthHeader(cred),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    query: options.query,
  });
  if (!res.ok) await throwFromResponse(res, `Repliz ${path}`);
  return res.json();
}

/** 204 No Content helper (delete/reconnect tidak mengembalikan body) */
async function replizEmpty(
  cred: ReplizCredentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<void> {
  const res = await httpRequest(`${API_BASE}${path}`, {
    method: options.method ?? "POST",
    headers: {
      Authorization: basicAuthHeader(cred),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) await throwFromResponse(res, `Repliz ${path}`);
}

// ---------- Account API (Standard+) ----------

/** List akun terkoneksi di workspace Repliz (paginated) */
export async function replizListAccounts(
  cred: ReplizCredentials,
  opts: { page?: number; limit?: number; type?: string; search?: string } = {},
): Promise<{ docs: ReplizAccount[]; totalDocs: number; hasNextPage: boolean; nextPage: number | null }> {
  return replizRequest(cred, "/public/account", {
    query: {
      page: String(opts.page ?? 1),
      limit: String(opts.limit ?? 20),
      ...(opts.type ? { types: opts.type } : {}),
      ...(opts.search ? { search: opts.search } : {}),
    },
  });
}

/** Detail satu akun Repliz — sumber kebenaran isConnected untuk health akun bridge */
export async function replizGetAccount(
  cred: ReplizCredentials,
  accountId: string,
): Promise<ReplizAccount> {
  return replizRequest(cred, `/public/account/${accountId}`);
}

// ---------- OAuth Account Connect (Gold+) ----------

/**
 * Mulai flow OAuth via app milik Repliz: dapatkan URL authorize platform.
 * `redirect` = URL callback kita — platform akan mengembalikan code ke sana.
 */
export async function replizAuthorizeUrl(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  redirect: string,
): Promise<string> {
  const type = REPLIZ_PLATFORMS[platformKey];
  const data = await replizRequest<{ url: string }>(cred, `/public/account/${type}/authorize`, {
    query: { redirect },
  });
  if (!data?.url) {
    throw new PublishError("repliz_no_authorize_url", "Repliz tidak mengembalikan URL authorize.", false);
  }
  return data.url;
}

/** Exchange authorization code → user access token Repliz */
export async function replizExchangeCode(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  code: string,
): Promise<string> {
  const type = REPLIZ_PLATFORMS[platformKey];
  const data = await replizRequest<{ token: string }>(cred, `/public/account/${type}/exchange`, {
    method: "POST",
    body: { code },
  });
  if (!data?.token) {
    throw new PublishError("repliz_no_token", "Repliz tidak mengembalikan token exchange.", false);
  }
  return data.token;
}

/** Ambil daftar Page Facebook milik user (dengan page token masing-masing) */
export async function replizGetFacebookPages(
  cred: ReplizCredentials,
  token: string,
): Promise<ReplizPage[]> {
  const data = await replizRequest<{ docs: ReplizPage[] }>(cred, "/public/account/facebook/page", {
    query: { token },
  });
  return data?.docs ?? [];
}

/** Channel YouTube hasil get-channel (berisi channel token) */
export type ReplizChannel = ReplizPage; // bentuk sama: id, name, username, picture, token

/** Ambil daftar channel YouTube milik user (dengan channel token masing-masing) */
export async function replizGetYouTubeChannels(
  cred: ReplizCredentials,
  token: string,
): Promise<ReplizChannel[]> {
  const data = await replizRequest<{ docs: ReplizChannel[] }>(cred, "/public/account/youtube/channel", {
    query: { token },
  });
  return data?.docs ?? [];
}

/** Organization LinkedIn hasil get-organization (berisi org token) */
export type ReplizOrganization = ReplizPage; // bentuk sama: id (urn:li:organization:*), name, username, picture, token

/** Ambil daftar LinkedIn organization yang di-admin user (dengan org token) */
export async function replizGetLinkedInOrganizations(
  cred: ReplizCredentials,
  token: string,
): Promise<ReplizOrganization[]> {
  const data = await replizRequest<{ docs: ReplizOrganization[] }>(
    cred,
    "/public/account/linkedin/organization",
    { query: { token } },
  );
  return data?.docs ?? [];
}

/**
 * Hubungkan akun ke workspace Repliz → accountId.
 * Flow per platform (docs.repliz.com):
 * - instagram / threads / tiktok: { code } — tanpa exchange
 * - facebook:    { pageId, token }
 * - youtube:     { channelId, token }
 * - linkedin:    { organizationId, token }
 */
export type ReplizConnectInput =
  | { code: string }
  | { pageId: string; token: string }
  | { channelId: string; token: string }
  | { organizationId: string; token: string };

export async function replizConnectAccount(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  input: ReplizConnectInput,
): Promise<string> {
  const type = REPLIZ_PLATFORMS[platformKey];
  const data = await replizRequest<{ accountId: string }>(cred, `/public/account/${type}/connect`, {
    method: "POST",
    body: input,
  });
  if (!data?.accountId) {
    throw new PublishError("repliz_no_account_id", "Repliz tidak mengembalikan accountId.", false);
  }
  return data.accountId;
}

/**
 * Reconnect akun yang token-nya expired (POST /connect/{accountId}).
 * Catatan: entity id (pageId/channelId/organizationId) HARUS sama dengan connect awal
 * (error 400 "incorrect generatedId"); instagram/threads/tiktok kirim ulang { code }.
 */
export async function replizReconnectAccount(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  accountId: string,
  input: ReplizConnectInput,
): Promise<void> {
  const type = REPLIZ_PLATFORMS[platformKey];
  await replizEmpty(cred, `/public/account/${type}/connect/${accountId}`, {
    method: "POST",
    body: input,
  });
}

/** Hapus akun dari workspace Repliz */
export async function replizRemoveAccount(
  cred: ReplizCredentials,
  accountId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/account/${accountId}`, { method: "DELETE" });
}

// ---------- Schedule API (Premium+) ----------

/** Buat scheduled post → schedule id (status awal "pending") */
export async function replizCreateSchedule(
  cred: ReplizCredentials,
  input: ReplizScheduleInput,
): Promise<string> {
  const data = await replizRequest<{ id?: string; _id?: string }>(cred, "/public/schedule", {
    method: "POST",
    body: input,
  });
  const id = data?.id ?? data?._id;
  if (!id) {
    throw new PublishError("repliz_no_schedule_id", "Repliz tidak mengembalikan schedule ID.", false);
  }
  return id;
}

/** Cari satu schedule by id — lewat filter accountIds karena tidak ada endpoint get-by-id */
export async function replizGetSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
  accountId: string,
): Promise<ReplizSchedule | null> {
  const data = await replizRequest<{ docs: Array<Record<string, unknown>> }>(cred, "/public/schedule", {
    query: {
      page: "1",
      limit: "50",
      accountIds: accountId,
    },
  });
  const match = (data?.docs ?? []).find((d) => d._id === scheduleId || d.id === scheduleId);
  if (!match) return null;
  return {
    id: String(match._id ?? match.id),
    status: match.status as ReplizScheduleStatus,
    postId: match.postId ? String(match.postId) : undefined,
    scheduleAt: String(match.scheduleAt ?? ""),
    type: String(match.type ?? ""),
    accountId: String(match.accountId ?? accountId),
  };
}

/** Hapus/cancel schedule yang belum tayang */
export async function replizRemoveSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/schedule/${scheduleId}`, { method: "DELETE" });
}
