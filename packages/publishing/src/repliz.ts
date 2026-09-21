// Repliz API client — bridge publish sebelum akses API native platform disetujui.
// Docs: https://docs.repliz.com/api/introduction.html
// Auth: Basic (AccessKey:SecretKey), disimpan terenkripsi di tabel bridge_config.
// Tier syarat: OAuth Connect APIs + Chat/Content = Gold+; Schedule = Premium+.

import { db } from "@sahabatkreator/db";
import { bridgeConfig } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "./crypto";
import { type HttpResponse, httpRequest, throwFromResponse } from "./http";
import { PublishError } from "./types";

const API_BASE = "https://api.repliz.com";

/**
 * Platform yang didukung bridge Repliz (mapping enum platform kita → type akun Repliz).
 * NOTE: Repliz hanya punya SATU type "linkedin" — app LinkedIn mereka membawahi
 * scope personal (w_member_social) + company (rw_organization_admin) sekaligus.
 * Karena itu `linkedin` dan `linkedin_org` SAMA-SAMA dipetakan ke "linkedin";
 * pemisahan personal vs company dilakukan di callback lewat filter URN
 * (urn:li:person: vs urn:li:organization:) — konsisten dgn flow native.
 */
export const REPLIZ_PLATFORMS = {
  facebook: "facebook",
  instagram: "instagram",
  instagram_standalone: "instagram",
  threads: "threads",
  tiktok: "tiktok",
  youtube: "youtube",
  linkedin: "linkedin",
  linkedin_org: "linkedin",
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
  /** Metadata preview untuk type "link" (Facebook only) — meta.url wajib diisi */
  meta?: { title?: string; description?: string; url?: string };
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
): Promise<{
  docs: ReplizAccount[];
  totalDocs: number;
  hasNextPage: boolean;
  nextPage: number | null;
}> {
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
    throw new PublishError(
      "repliz_no_authorize_url",
      "Repliz tidak mengembalikan URL authorize.",
      false,
    );
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
  const data = await replizRequest<{ docs: ReplizChannel[] }>(
    cred,
    "/public/account/youtube/channel",
    {
      query: { token },
    },
  );
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
  const data = await replizRequest<{ id?: string; _id?: string; scheduleId?: string }>(
    cred,
    "/public/schedule",
    {
      method: "POST",
      body: input,
    },
  );
  // Response create: {"scheduleId":"..."} (HTTP 201); list docs pakai _id/id.
  const id = data?.scheduleId ?? data?.id ?? data?._id;
  if (!id) {
    throw new PublishError(
      "repliz_no_schedule_id",
      "Repliz tidak mengembalikan schedule ID.",
      false,
    );
  }
  return id;
}

/**
 * Ambil satu schedule by id.
 *
 * Pakai endpoint langsung GET /public/schedule/{scheduleId} (docs "Get One
 * Schedule") — mengembalikan doc lengkap (status, postId, account). Sebelumnya
 * kode ini memfilter GET /public/schedule berhalaman untuk mencari id, yang
 * rapuh: schedule di luar halaman pertama (limit 50) tidak pernah ketemu.
 *
 * Fallback ke filter list hanya jika endpoint by-id 404 (kompatibilitas tier
 * lama); pakai accountIds[] (bukan accountIds) supaya filter ditegakkan.
 */
export async function replizGetSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
  accountId: string,
): Promise<ReplizSchedule | null> {
  const mapSchedule = (d: Record<string, unknown>): ReplizSchedule => ({
    id: String(d._id ?? d.id),
    status: d.status as ReplizScheduleStatus,
    postId: d.postId ? String(d.postId) : undefined,
    scheduleAt: String(d.scheduleAt ?? ""),
    type: String(d.type ?? ""),
    accountId: String(d.accountId ?? accountId),
  });

  try {
    const data = await replizRequest<Record<string, unknown>>(
      cred,
      `/public/schedule/${scheduleId}`,
    );
    if (data && (data._id || data.id)) return mapSchedule(data);
    return null;
  } catch (error) {
    // 404 "schedule not found" → schedule belum terbentuk di sisi Repliz (race
    // singkat setelah create). Bukan error — sinyal "belum ada" untuk poller.
    if (error instanceof PublishError && error.code === "http_404") return null;
    // Error lain (mis. tier lama tanpa endpoint by-id) → fallback ke filter list.
    const data = await replizRequest<{ docs: Array<Record<string, unknown>> }>(
      cred,
      "/public/schedule",
      {
        query: {
          page: "1",
          limit: "50",
          accountIds: accountId,
        },
      },
    );
    const match = (data?.docs ?? []).find((d) => d._id === scheduleId || d.id === scheduleId);
    return match ? mapSchedule(match) : null;
  }
}

/** Hapus/cancel schedule yang belum tayang */
export async function replizRemoveSchedule(
  cred: ReplizCredentials,
  scheduleId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/schedule/${scheduleId}`, { method: "DELETE" });
}

// ---------- Shared credentials ----------

/**
 * Kredensial bridge Repliz aktif dari DB (null bila bridge dimatikan admin atau
 * decrypt gagal). Sumber tunggal untuk semua konsumen bridge di package ini
 * (reply, dm-sync, auto-reply, posts-sync, analytics-sync).
 */
export async function replizActiveCredentials(): Promise<ReplizCredentials | null> {
  const [row] = await db
    .select()
    .from(bridgeConfig)
    .where(and(eq(bridgeConfig.provider, "repliz"), eq(bridgeConfig.isActive, true)))
    .limit(1);
  if (!row) return null;
  try {
    return { accessKey: row.accessKey, secretKey: decrypt(row.secretEnc) };
  } catch {
    return null;
  }
}

// ---------- Comment API (Standard+) ----------

/** Orang/platform yang memiliki sebuah post atau komentar */
export type ReplizCommentOwner = {
  id?: string;
  name?: string;
  picture?: string;
};

/** Satu doc komentar di antrian Repliz (GET /public/comment) */
export type ReplizCommentDoc = {
  _id: string;
  id?: string;
  status?: string;
  accountId?: string;
  createdAt?: string;
  /** Post yang dikomentari — konteks saja */
  content?: {
    id?: string;
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    owner?: ReplizCommentOwner;
    medias?: ReplizCommentMedia[];
    createdAt?: string;
  };
  /** Komentar itu sendiri — sumber text & author */
  comment?: {
    id?: string;
    type?: string;
    text?: string;
    owner?: ReplizCommentOwner;
    medias?: ReplizCommentMedia[];
    createdAt?: string;
    hasReplies?: boolean;
  };
};

export type ReplizCommentMedia = { url?: string; type?: string };

/**
 * List komentar di antrian Repliz (GET /public/comment).
 * status: "pending" (baru/belum dibalas) | "resolved" | "ignored".
 *
 * Penting: filter account WAJIB pakai notasi array `accountIds[]`. Bentuk
 * `accountIds=` (tanpa bracket) DIABAIKAN API — diverifikasi live: ia
 * mengembalikan seluruh comment workspace, sehingga komentar akun bridge A
 * bocor ke inbox akun bridge B. Dengan bracket, filter ditegakkan (0 doc
 * untuk akun yang tak punya comment).
 */
export async function replizListComments(
  cred: ReplizCredentials,
  accountId: string,
  opts: { page?: number; limit?: number; status?: "pending" | "resolved" | "ignored" } = {},
): Promise<{ docs: ReplizCommentDoc[]; total?: number }> {
  const query: Record<string, string> = {
    page: String(opts.page ?? 1),
    limit: String(opts.limit ?? 20),
    status: opts.status ?? "pending",
    // URLSearchParams meng-encode [] → %5B%5D (juga diterima API, tetap filter)
    "accountIds[]": accountId,
  };
  return replizRequest(cred, "/public/comment", { query });
}

/**
 * Balas komentar yang tersimpan di Repliz — reply dikirim ke platform asli.
 * POST /public/comment/{commentId} body { text } → { commentId }
 * commentId = _id komentar Repliz (disimpan di engagement_item.platform_item_id).
 */
export async function replizReplyComment(
  cred: ReplizCredentials,
  commentId: string,
  text: string,
): Promise<string> {
  const data = await replizRequest<{ commentId?: string }>(cred, `/public/comment/${commentId}`, {
    method: "POST",
    body: { text },
  });
  if (!data?.commentId) {
    throw new PublishError(
      "repliz_reply_no_id",
      "Repliz tidak mengembalikan commentId reply.",
      true,
    );
  }
  return data.commentId;
}

/**
 * Komentari sebuah konten/post yang sudah terbit di akun bridge.
 * POST /public/content/{contentId}/comment body { accountId, text } → { commentId }
 * (docs Repliz "Create Comment", tier Gold+). Dipakai untuk first comment pada
 * post yang dipublikasikan via Schedule API bridge — contentId = platformPostId
 * post tersebut (id konten Repliz).
 */
export async function replizCreateComment(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
  text: string,
): Promise<string> {
  const data = await replizRequest<{ commentId?: string }>(
    cred,
    `/public/content/${contentId}/comment`,
    {
      method: "POST",
      body: { accountId, text },
    },
  );
  if (!data?.commentId) {
    throw new PublishError(
      "repliz_comment_no_id",
      "Repliz tidak mengembalikan commentId.",
      true,
    );
  }
  return data.commentId;
}

/** Hapus komentar dari workspace Repliz (DELETE /public/comment/{commentId}) */
export async function replizDeleteComment(
  cred: ReplizCredentials,
  commentId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/comment/${commentId}`, { method: "DELETE" });
}

// ---------- Chat API (Gold+) ----------

/** Percakapan DM di workspace Repliz (GET /public/chat) */
export type ReplizChat = {
  _id: string;
  id: string;
  accountId: string;
  senderId: string;
  senderName?: string;
  senderPicture?: string;
  unreadCount?: number;
  lastMessage?: {
    isFromMe: boolean;
    senderId?: string;
    messageId: string;
    type: string;
    status?: string;
    text?: string;
    sendAt?: string;
    fromSenderAt?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

/** Pesan dalam satu chat Repliz (GET /public/chat/{chatId}/message) */
export type ReplizChatMessage = {
  _id: string;
  id: string;
  chatId: string;
  messageId: string;
  senderId?: string;
  type: string; // text | image | video | audio | document | button
  status?: string;
  isFromMe: boolean;
  text?: string;
  accountId?: string;
  createdAt?: string;
};

/**
 * List percakapan DM akun bridge (filter status unread/unreplied opsional).
 *
 * Filter account WAJIB notasi array `accountIds[]` — bentuk `accountIds=`
 * diabaikan API (diverifikasi live di endpoint comment; chat dokumennya
 * sama: param `accountIds` bertipe array). Bentuk salah → DM seluruh
 * workspace bocor ke inbox akun bridge yang lain.
 */
export async function replizListChats(
  cred: ReplizCredentials,
  opts: { accountId: string; page?: number; limit?: number; status?: "unread" | "unreplied" },
): Promise<{
  docs: ReplizChat[];
  totalDocs: number;
  hasNextPage: boolean;
  nextPage: number | null;
}> {
  return replizRequest(cred, "/public/chat", {
    query: {
      page: String(opts.page ?? 1),
      limit: String(opts.limit ?? 20),
      "accountIds[]": opts.accountId,
      ...(opts.status ? { status: opts.status } : {}),
    },
  });
}

/** List pesan satu percakapan (urut createdAt ascending di sisi Repliz) */
export async function replizListChatMessages(
  cred: ReplizCredentials,
  chatId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{
  docs: ReplizChatMessage[];
  totalDocs: number;
  hasNextPage: boolean;
  nextPage: number | null;
}> {
  return replizRequest(cred, `/public/chat/${chatId}/message`, {
    query: { page: String(opts.page ?? 1), limit: String(opts.limit ?? 50) },
  });
}

/** Kirim pesan teks ke percakapan (POST /public/chat/{chatId}/message) → messageId */
export async function replizSendChatMessage(
  cred: ReplizCredentials,
  chatId: string,
  text: string,
): Promise<string> {
  const data = await replizRequest<{ messageId?: string }>(cred, `/public/chat/${chatId}/message`, {
    method: "POST",
    body: { type: "text", text },
  });
  if (!data?.messageId) {
    throw new PublishError("repliz_dm_no_id", "Repliz tidak mengembalikan messageId.", true);
  }
  return data.messageId;
}

/** Tandai semua pesan chat sudah dibaca (POST /public/chat/{chatId}/read → 204) */
export async function replizReadChat(cred: ReplizCredentials, chatId: string): Promise<void> {
  await replizEmpty(cred, `/public/chat/${chatId}/read`, { method: "POST", body: {} });
}

// ---------- Content API (Gold+) ----------

/** Konten terpublish di akun Repliz (GET /public/content) */
export type ReplizContent = {
  id: string;
  title?: string;
  description?: string;
  topic?: string;
  type: string; // text | image | video | reel | album | link | story
  owner?: { id: string; name?: string; picture?: string };
  medias?: Array<{ type: string; thumbnail?: string; url: string }>;
  url?: string;
  createdAt?: string;
  /** Statistik ringkas (mis. { comment: 3 }) — ada di response list content */
  statistic?: Record<string, number>;
};

/**
 * List konten terpublish akun bridge (paginasi cursor nextToken).
 * type "media" = post/reel/video; "story" = story (expiring).
 */
export async function replizListContent(
  cred: ReplizCredentials,
  accountId: string,
  opts: { nextToken?: string; type?: "media" | "story" } = {},
): Promise<{ docs: ReplizContent[]; nextToken?: string }> {
  const query: Record<string, string> = { accountId };
  if (opts.nextToken) query.nextToken = opts.nextToken;
  if (opts.type) query.type = opts.type;
  return replizRequest(cred, "/public/content", { query });
}

/**
 * Statistik engagement satu konten (GET /public/content/{contentId}/statistic).
 * Field yang dikembalikan bervariasi per platform (mis. FB: like/comment/share;
 * IG: + reach/saved/views/interaction; Threads: replies/repost/quotes; dll).
 */
export type ReplizContentStatistic = {
  like?: number;
  dislike?: number;
  comment?: number;
  share?: number;
  reach?: number;
  saved?: number;
  views?: number;
  watched?: number;
  interaction?: number;
  replies?: number;
  repost?: number;
  quotes?: number;
  favourite?: number;
  newFollower?: number;
  impression?: number;
  bookmark?: number;
  retweet?: number;
};

export async function replizGetContentStatistic(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
): Promise<ReplizContentStatistic> {
  return replizRequest(cred, `/public/content/${contentId}/statistic`, {
    query: { accountId },
  });
}

/**
 * Detail satu konten by id (GET /public/content/{contentId}?accountId=…).
 * Sumber otoritatif permalink (field `url`) untuk post yang terbit via Schedule
 * API — response Schedule hanya berisi postId, tidak ada URL. Sebelumnya
 * pipeline memindai halaman pertama GET /public/content untuk mencari id,
 * yang rapuh: post di luar halaman pertama tidak ketemu → URL tetap null.
 */
export async function replizGetContent(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
): Promise<ReplizContent | null> {
  const data = await replizRequest<Record<string, unknown>>(
    cred,
    `/public/content/${contentId}`,
    { query: { accountId } },
  );
  if (!data || (!data.id && !data._id)) return null;
  return {
    id: String(data.id ?? data._id),
    title: data.title ? String(data.title) : undefined,
    description: data.description ? String(data.description) : undefined,
    topic: data.topic ? String(data.topic) : undefined,
    type: String(data.type ?? ""),
    owner: data.owner as ReplizContent["owner"],
    medias: data.medias as ReplizContent["medias"],
    url: data.url ? String(data.url) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    statistic: data.statistic as Record<string, number> | undefined,
  };
}
