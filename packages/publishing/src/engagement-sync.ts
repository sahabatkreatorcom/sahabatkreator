// Sinkronisasi engagement (komentar/review) dari platform ke unified inbox
// Dua sumber data memakai fungsi upsert yang sama:
// 1. Polling (worker, tiap 15 menit per akun) — jalan sekarang tanpa perlu approval webhook
// 2. Webhook receiver (server, saat app di-approve) — push real-time Meta/TikTok
//
// Cakupan polling per platform:
// - instagram / instagram_standalone: media terbaru → comments per media
// - facebook: published_posts → comments per post
// - threads: conversations (threads_read_replies)
// - tiktok: video/list → comment/list (comment.list + video.list)
// - youtube: commentThreads allThreadsRelatedToChannel (youtube.force-ssl)
// - google_business: locations → reviews (business.manage)
// - linkedin / pinterest / bluesky: tanpa API list komentar member publik → skip

import { db } from "@sahabatkreator/db";
import { engagementItem, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { processAutomation } from "./automation";
import {
  GBP_API_URL,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_URL,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "./config";
import { decrypt } from "./crypto";
import { httpRequest } from "./http";

const GRAPH_FB = GRAPH_FB_URL;
const GRAPH_IG = GRAPH_IG_URL;
const GRAPH_THREADS = GRAPH_THREADS_URL;

/** Item inbox hasil fetch (dipakai polling & webhook) */
export type EngagementUpsert = {
  socialAccountId: string;
  organizationId: string;
  type: "comment" | "mention" | "dm" | "review" | "post";
  platformItemId: string;
  parentId?: string | null;
  /** ID penulis di platform (IG/FB/Threads user id) — kunci data deletion callback */
  platformAuthorId?: string | null;
  authorName?: string | null;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  content?: string | null;
  rating?: number | null;
  mediaUrl?: string | null;
  occurredAt?: Date | null;
};

/** ID generator — sama pola dengan apps/server/src/lib/id.ts (prefix sk_) */
function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}

/**
 * Upsert batch item engagement — dedupe per (socialAccountId, platformItemId).
 * Item yang sudah ada TIDAK ditimpa reply/status (hanya konten & metadata diperbarui).
 * Return jumlah item baru yang masuk + trigger automation untuk komentar baru.
 */
export async function upsertEngagementItems(items: EngagementUpsert[]): Promise<number> {
  if (items.length === 0) return 0;

  // Dedupe input (webhook bisa kirim duplikat dalam satu batch)
  const byKey = new Map<string, EngagementUpsert>();
  for (const item of items) {
    byKey.set(`${item.socialAccountId}:${item.platformItemId}`, item);
  }
  const unique = [...byKey.values()];

  // Cek yang sudah ada — skip (konten komentar tidak berubah; reply jangan ditimpa)
  const existing = await db
    .select({
      socialAccountId: engagementItem.socialAccountId,
      platformItemId: engagementItem.platformItemId,
    })
    .from(engagementItem)
    .where(
      and(
        eq(engagementItem.socialAccountId, unique[0]!.socialAccountId),
        inArray(
          engagementItem.platformItemId,
          unique.map((i) => i.platformItemId),
        ),
      ),
    );
  const existingKeys = new Set(existing.map((r) => `${r.socialAccountId}:${r.platformItemId}`));

  const fresh = unique.filter((i) => !existingKeys.has(`${i.socialAccountId}:${i.platformItemId}`));
  if (fresh.length === 0) return 0;

  await db.insert(engagementItem).values(
    fresh.map((item) => ({
      id: generateId("eng"),
      organizationId: item.organizationId,
      socialAccountId: item.socialAccountId,
      type: item.type,
      status: "unread" as const,
      platformItemId: item.platformItemId,
      parentId: item.parentId ?? null,
      platformAuthorId: item.platformAuthorId ?? null,
      authorName: item.authorName ?? null,
      authorUsername: item.authorUsername ?? null,
      authorAvatarUrl: item.authorAvatarUrl ?? null,
      content: item.content ?? null,
      rating: item.rating ?? null,
      mediaUrl: item.mediaUrl ?? null,
      occurredAt: item.occurredAt ?? new Date(),
    })),
  );

  // Automation: evaluasi keyword trigger untuk komentar/mention baru (best-effort)
  for (const item of fresh) {
    if ((item.type !== "comment" && item.type !== "mention") || !item.content) continue;
    await processAutomation({
      organizationId: item.organizationId,
      socialAccountId: item.socialAccountId,
      source: "comment",
      platformItemId: item.platformItemId,
      text: item.content,
      partnerName: item.authorName ?? null,
      partnerUsername: item.authorUsername ?? null,
    }).catch(() => undefined);
  }

  return fresh.length;
}

/** Konteks akun untuk sync */
export type SyncContext = {
  account: {
    id: string;
    organizationId: string;
    platform: string;
    platformAccountId: string;
    accessTokenEnc: string | null;
    metadata: Record<string, unknown> | null;
  };
  accessToken: string;
};

/** Hasil satu siklus sync akun */
export type SyncResult = { platform: string; newItems: number; error?: string };

/**
 * Sync satu akun: fetch komentar/review terbaru → upsert inbox.
 * Return ringkasan. Error TIDAK di-throw per-item — dikumpulkan agar satu post gagal
 * tidak menghentikan sync lainnya.
 */
export async function syncAccountEngagement(ctx: SyncContext): Promise<SyncResult> {
  try {
    // Akun bridge Repliz: komentar via Comment API Repliz + health check isConnected
    if (ctx.account.metadata?.replizAccountId) {
      return syncRepliz(ctx);
    }
    switch (ctx.account.platform) {
      case "instagram":
        return syncInstagram(ctx, GRAPH_FB);
      case "instagram_standalone":
        return syncInstagram(ctx, GRAPH_IG);
      case "facebook":
        return syncFacebook(ctx);
      case "threads":
        return syncThreads(ctx);
      case "tiktok":
        return syncTikTok(ctx);
      case "youtube":
        return syncYouTube(ctx);
      case "google_business":
        return syncGoogleBusiness(ctx);
      default:
        return { platform: ctx.account.platform, newItems: 0 };
    }
  } catch (error) {
    return {
      platform: ctx.account.platform,
      newItems: 0,
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Instagram (kedua jalur — host beda, endpoint sama)
// ---------------------------------------------------------------------------

type IgComment = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  // mention webhook: media terpisah; polling: comment punya media
  media?: { id?: string; media_url?: string; media_product_type?: string };
  replies?: { data?: IgComment[] };
};

async function syncInstagram(ctx: SyncContext, base: string): Promise<SyncResult> {
  const igUserId = ctx.account.platformAccountId;
  // Page access token utk jalur FB (metadata.pageAccessToken)
  const token =
    (typeof ctx.account.metadata?.pageAccessToken === "string"
      ? (ctx.account.metadata.pageAccessToken as string)
      : null) ?? ctx.accessToken;

  // Media terbaru milik akun (10 terakhir — inbox fokus ke post baru)
  const mediaRes = await httpRequest<{ data?: Array<{ id: string; media_url?: string }> }>(
    `${base}/${igUserId}/media`,
    { query: { fields: "id,media_url", limit: 10, access_token: token } },
  );
  if (!mediaRes.ok) {
    const text = await mediaRes.text().catch(() => "");
    return {
      platform: ctx.account.platform,
      newItems: 0,
      error: `IG media: ${text.slice(0, 150)}`,
    };
  }
  const mediaList = (await mediaRes.json()).data ?? [];

  const items: EngagementUpsert[] = [];
  for (const media of mediaList) {
    const commentsRes = await httpRequest<{ data?: IgComment[] }>(`${base}/${media.id}/comments`, {
      query: { fields: "id,text,username,timestamp", limit: 50, access_token: token },
    });
    if (!commentsRes.ok) continue; // post tertentu gagal → lanjut post lain
    const comments = (await commentsRes.json()).data ?? [];
    for (const comment of comments) {
      items.push({
        socialAccountId: ctx.account.id,
        organizationId: ctx.account.organizationId,
        type: "comment",
        platformItemId: comment.id,
        authorUsername: comment.username ? `@${comment.username}` : null,
        content: comment.text ?? null,
        mediaUrl: media.media_url ?? null,
        occurredAt: comment.timestamp ? new Date(comment.timestamp) : null,
      });
    }
  }
  const newItems = await upsertEngagementItems(items);
  return { platform: ctx.account.platform, newItems };
}

// ---------------------------------------------------------------------------
// Facebook Page
// ---------------------------------------------------------------------------

async function syncFacebook(ctx: SyncContext): Promise<SyncResult> {
  const pageId = ctx.account.platformAccountId;
  const token =
    (typeof ctx.account.metadata?.pageAccessToken === "string"
      ? (ctx.account.metadata.pageAccessToken as string)
      : null) ?? ctx.accessToken;

  const postsRes = await httpRequest<{
    data?: Array<{ id: string; message?: string; permalink_url?: string }>;
  }>(`${GRAPH_FB}/${pageId}/published_posts`, {
    query: { fields: "id,message,permalink_url", limit: 10, access_token: token },
  });
  if (!postsRes.ok) {
    const text = await postsRes.text().catch(() => "");
    return { platform: "facebook", newItems: 0, error: `FB posts: ${text.slice(0, 150)}` };
  }
  const posts = (await postsRes.json()).data ?? [];

  const items: EngagementUpsert[] = [];
  for (const post of posts) {
    const commentsRes = await httpRequest<{
      data?: Array<{
        id: string;
        message?: string;
        created_time?: string;
        from?: { id?: string; name?: string; picture?: { data?: { url?: string } } };
      }>;
    }>(`${GRAPH_FB}/${post.id}/comments`, {
      query: {
        fields: "id,message,created_time,from{id,name,picture.type(large)}",
        limit: 50,
        access_token: token,
      },
    });
    if (!commentsRes.ok) continue;
    const comments = (await commentsRes.json()).data ?? [];
    for (const comment of comments) {
      items.push({
        socialAccountId: ctx.account.id,
        organizationId: ctx.account.organizationId,
        type: "comment",
        platformItemId: comment.id,
        platformAuthorId: comment.from?.id ?? null,
        authorName: comment.from?.name ?? null,
        authorAvatarUrl: comment.from?.picture?.data?.url ?? null,
        content: comment.message ?? null,
        mediaUrl: post.permalink_url ?? null,
        occurredAt: comment.created_time ? new Date(comment.created_time) : null,
      });
    }
  }

  // Reviews/rekomendasi Page (review management Facebook) — best-effort,
  // Page tanpa tab review / tanpa permission tidak menggagalkan sync komentar
  const ratingsRes = await httpRequest<{
    data?: Array<{
      id: string;
      created_time?: string;
      rating?: number;
      review_text?: string;
      reviewer?: { id?: string; name?: string; picture?: { data?: { url?: string } } };
    }>;
  }>(`${GRAPH_FB}/${pageId}/ratings`, {
    query: {
      fields: "id,created_time,rating,review_text,reviewer{id,name,picture.type(large)}",
      limit: 50,
      access_token: token,
    },
  });
  if (ratingsRes.ok) {
    const ratings = (await ratingsRes.json()).data ?? [];
    for (const rating of ratings) {
      items.push({
        socialAccountId: ctx.account.id,
        organizationId: ctx.account.organizationId,
        type: "review",
        platformItemId: rating.id,
        platformAuthorId: rating.reviewer?.id ?? null,
        authorName: rating.reviewer?.name ?? null,
        authorAvatarUrl: rating.reviewer?.picture?.data?.url ?? null,
        content: rating.review_text ?? null,
        rating: rating.rating ?? null,
        occurredAt: rating.created_time ? new Date(rating.created_time) : null,
      });
    }
  }

  const newItems = await upsertEngagementItems(items);
  return { platform: "facebook", newItems };
}

// ---------------------------------------------------------------------------
// Threads — conversations berisi reply ke post kita
// ---------------------------------------------------------------------------

async function syncThreads(ctx: SyncContext): Promise<SyncResult> {
  const userId = ctx.account.platformAccountId;

  // Step 1: Fetch user's threads (media containers)
  const threadsRes = await httpRequest<{
    data?: Array<{
      id: string;
      timestamp?: string;
    }>;
  }>(`${GRAPH_THREADS}/${userId}/threads`, {
    query: { fields: "id,timestamp", limit: 20, access_token: ctx.accessToken },
  });
  if (!threadsRes.ok) {
    const text = await threadsRes.text().catch(() => "");
    return { platform: "threads", newItems: 0, error: `Threads list: ${text.slice(0, 150)}` };
  }
  const threads = (await threadsRes.json()).data ?? [];

  // Step 2: For each thread, fetch replies using thread_replies field
  const items: EngagementUpsert[] = [];
  for (const thread of threads) {
    const repliesRes = await httpRequest<{
      data?: Array<{
        id: string;
        text?: string;
        username?: string;
        timestamp?: string;
      }>;
    }>(`${GRAPH_THREADS}/${thread.id}/replies`, {
      query: { fields: "id,text,username,timestamp", access_token: ctx.accessToken },
    });
    if (!repliesRes.ok) continue;
    const replies = (await repliesRes.json()).data ?? [];

    for (const reply of replies) {
      items.push({
        socialAccountId: ctx.account.id,
        organizationId: ctx.account.organizationId,
        type: "comment",
        platformItemId: reply.id,
        parentId: thread.id,
        authorUsername: reply.username ? `@${reply.username}` : null,
        content: reply.text ?? null,
        occurredAt: reply.timestamp ? new Date(reply.timestamp) : null,
      });
    }
  }
  const newItems = await upsertEngagementItems(items);
  return { platform: "threads", newItems };
}

// ---------------------------------------------------------------------------
// TikTok — video list → comment list
// ---------------------------------------------------------------------------

async function syncTikTok(ctx: SyncContext): Promise<SyncResult> {
  const headers = {
    Authorization: `Bearer ${ctx.accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
  };

  // Video terbaru (max 10) — butuh scope video.list
  const videosRes = await httpRequest<{
    data?: { videos?: Array<{ id: string; create_time?: number; title?: string }> };
    error?: { code?: string; message?: string };
  }>(`${TIKTOK_OPEN_API_URL}/video/list/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ max_count: 10 }),
    retries: 1,
  });
  if (!videosRes.ok) {
    const text = await videosRes.text().catch(() => "");
    return { platform: "tiktok", newItems: 0, error: `TikTok videos: ${text.slice(0, 150)}` };
  }
  const videos = (await videosRes.json()).data?.videos ?? [];

  const items: EngagementUpsert[] = [];
  for (const video of videos) {
    // comment/list paginated — ambil halaman pertama (50)
    const commentsRes = await httpRequest<{
      data?: {
        comments?: Array<{
          id: string;
          text?: string;
          create_time?: number;
          user?: { display_name?: string; avatar_url?: string };
        }>;
      };
      error?: { code?: string; message?: string };
    }>(`${TIKTOK_OPEN_API_URL}/comment/list/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ video_id: video.id, max_count: 50 }),
      retries: 1,
    });
    if (!commentsRes.ok) continue;
    const comments = (await commentsRes.json()).data?.comments ?? [];
    for (const comment of comments) {
      items.push({
        socialAccountId: ctx.account.id,
        organizationId: ctx.account.organizationId,
        type: "comment",
        platformItemId: comment.id,
        parentId: video.id,
        authorName: comment.user?.display_name ?? null,
        authorAvatarUrl: comment.user?.avatar_url ?? null,
        content: comment.text ?? null,
        occurredAt: comment.create_time ? new Date(comment.create_time * 1000) : null,
      });
    }
  }
  const newItems = await upsertEngagementItems(items);
  return { platform: "tiktok", newItems };
}

// ---------------------------------------------------------------------------
// YouTube — commentThreads semua thread channel
// ---------------------------------------------------------------------------

async function syncYouTube(ctx: SyncContext): Promise<SyncResult> {
  const channelId = ctx.account.platformAccountId;
  const res = await httpRequest<{
    items?: Array<{
      id: string;
      snippet?: {
        topLevelComment?: {
          id?: string;
          snippet?: {
            textOriginal?: string;
            authorDisplayName?: string;
            authorProfileImageUrl?: string;
            publishedAt?: string;
          };
        };
      };
    }>;
  }>(`${YOUTUBE_API_URL}/commentThreads`, {
    query: {
      part: "snippet",
      allThreadsRelatedToChannelId: channelId,
      maxResults: 50,
      order: "time",
    },
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { platform: "youtube", newItems: 0, error: `YT threads: ${text.slice(0, 150)}` };
  }
  const threads = (await res.json()).items ?? [];

  const items: EngagementUpsert[] = [];
  for (const thread of threads) {
    const top = thread.snippet?.topLevelComment;
    if (!top?.id) continue;
    items.push({
      socialAccountId: ctx.account.id,
      organizationId: ctx.account.organizationId,
      type: "comment",
      platformItemId: top.id,
      authorName: top.snippet?.authorDisplayName ?? null,
      authorAvatarUrl: top.snippet?.authorProfileImageUrl ?? null,
      content: top.snippet?.textOriginal ?? null,
      occurredAt: top.snippet?.publishedAt ? new Date(top.snippet.publishedAt) : null,
    });
  }
  const newItems = await upsertEngagementItems(items);
  return { platform: "youtube", newItems };
}

// ---------------------------------------------------------------------------
// Google Business Profile — reviews per location
// ---------------------------------------------------------------------------

async function syncGoogleBusiness(ctx: SyncContext): Promise<SyncResult> {
  // platformAccountId = "accounts/123" → list locations → reviews per location
  const locRes = await httpRequest<{
    locations?: Array<{ name: string; locationName?: string }>;
  }>(`${GBP_API_URL}/v1/${ctx.account.platformAccountId}/locations`, {
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  });
  if (!locRes.ok) {
    const text = await locRes.text().catch(() => "");
    return { platform: "google_business", newItems: 0, error: `GBP loc: ${text.slice(0, 150)}` };
  }
  const locations = (await locRes.json()).locations ?? [];

  const items: EngagementUpsert[] = [];
  for (const loc of locations.slice(0, 5)) {
    const revRes = await httpRequest<{
      reviews?: Array<{
        name: string; // locations/{loc}/reviews/{id}
        reviewer?: { displayName?: string; profilePhotoUrl?: string };
        starRating?: string; // "FIVE" dst
        comment?: string;
        createTime?: string;
      }>;
    }>(`${GBP_API_URL}/v4/${loc.name}/reviews`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    if (!revRes.ok) continue;
    const reviews = (await revRes.json()).reviews ?? [];
    const ratingMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    for (const review of reviews) {
      items.push({
        socialAccountId: ctx.account.id,
        organizationId: ctx.account.organizationId,
        type: "review",
        platformItemId: review.name,
        authorName: review.reviewer?.displayName ?? null,
        authorAvatarUrl: review.reviewer?.profilePhotoUrl ?? null,
        content: review.comment ?? null,
        rating: review.starRating ? (ratingMap[review.starRating] ?? null) : null,
        occurredAt: review.createTime ? new Date(review.createTime) : null,
      });
    }
  }
  const newItems = await upsertEngagementItems(items);
  return { platform: "google_business", newItems };
}

// ---------------------------------------------------------------------------
// Repliz bridge — komentar via Comment API + health check isConnected
// ---------------------------------------------------------------------------

/** Kredensial bridge aktif (null bila bridge dimatikan admin) */
async function replizCred(): Promise<{ accessKey: string; secretKey: string } | null> {
  const { bridgeConfig } = await import("@sahabatkreator/db/schema");
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

/** Comment Repliz (GET /public/comment) — bentuk menyesuaikan dokumen paginated docs */
type ReplizComment = {
  _id: string;
  message?: string;
  text?: string;
  username?: string;
  user?: { name?: string; username?: string; picture?: string };
  createdAt?: string;
  accountId?: string;
  status?: string;
};

/**
 * Sync akun bridge: health check (isConnected → needsReconnect) + komentar pending.
 * Komentar balasan/lanjutan (resolved/ignored) tidak diambil — inbox fokus item baru.
 */
async function syncRepliz(ctx: SyncContext): Promise<SyncResult> {
  const cred = await replizCred();
  if (!cred) return { platform: ctx.account.platform, newItems: 0, error: "bridge_off" };

  const { replizGetAccount } = await import("./repliz");
  const accountId = ctx.account.metadata!.replizAccountId as string;

  // Health: token platform expired di sisi Repliz → tandai butuh hubungkan ulang
  try {
    const info = await replizGetAccount(cred, accountId);
    if (!info.isConnected) {
      await db
        .update(socialAccount)
        .set({
          needsReconnect: true,
          lastError: "Token kedaluwarsa di bridge — hubungkan ulang.",
        })
        .where(eq(socialAccount.id, ctx.account.id));
      return { platform: ctx.account.platform, newItems: 0, error: "needs_reconnect" };
    }
    // Sehat kembali (reconnect sukses di Repliz) → reset flag
    await db
      .update(socialAccount)
      .set({ needsReconnect: false, lastError: null })
      .where(eq(socialAccount.id, ctx.account.id));
  } catch {
    // GET account gagal (network/429) → jangan blokir sync komentar
  }

  // Komentar pending di workspace Repliz → inbox kita
  const { httpRequest: http } = await import("./http");
  const res = await http<{ docs?: ReplizComment[] }>(
    `https://api.repliz.com/public/comment?page=1&limit=20&status=pending&accountIds=${encodeURIComponent(accountId)}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${cred.accessKey}:${cred.secretKey}`).toString("base64")}`,
      },
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      platform: ctx.account.platform,
      newItems: 0,
      error: `Repliz comment: ${text.slice(0, 150)}`,
    };
  }
  const comments = (await res.json()).docs ?? [];
  const items: EngagementUpsert[] = comments.map((c) => ({
    socialAccountId: ctx.account.id,
    organizationId: ctx.account.organizationId,
    type: "comment" as const,
    platformItemId: c._id,
    authorName: c.user?.name ?? null,
    authorUsername: c.username ?? (c.user?.username ? `@${c.user.username}` : null),
    authorAvatarUrl: c.user?.picture ?? null,
    content: c.message ?? c.text ?? null,
    occurredAt: c.createdAt ? new Date(c.createdAt) : null,
  }));
  const newItems = await upsertEngagementItems(items);
  return { platform: ctx.account.platform, newItems };
}

// ---------------------------------------------------------------------------
// Sinkronisasi massal — dipakai worker (polling fallback webhook)
// ---------------------------------------------------------------------------

/**
 * Sync akun-akun yang terhubung dan due (lastSyncedAt lebih tua dari intervalMinutes).
 * Batasi maxAccounts per siklus agar tidak burst rate limit platform.
 * Akun diproses paralel dalam batch kecil (BATCH_SIZE) — satu akun gagal
 * tidak menghentikan batch lainnya (Promise.allSettled).
 */
export async function syncDueAccounts(
  intervalMinutes = 15,
  maxAccounts = 10,
): Promise<{ synced: number; newItems: number; errors: string[] }> {
  const BATCH_SIZE = 3;
  const since = new Date(Date.now() - intervalMinutes * 60 * 1000);
  // Akun connected yang belum pernah sync ATAU sync-nya lebih tua dari interval
  const accounts = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      accessTokenEnc: socialAccount.accessTokenEnc,
      metadata: socialAccount.metadata,
      lastSyncedAt: socialAccount.lastSyncedAt,
      username: socialAccount.username,
    })
    .from(socialAccount)
    .where(eq(socialAccount.isConnected, true))
    .limit(maxAccounts * 3); // filter waktu di memori (drizzle OR null)

  const due = accounts
    .filter((a) => !a.lastSyncedAt || a.lastSyncedAt < since)
    .filter((a) => a.platform !== "manual")
    .slice(0, maxAccounts);

  let newItems = 0;
  const errors: string[] = [];
  let synced = 0;

  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const batch = due.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (account) => {
        // Akun bridge: token tidak ada di sisi kita (Repliz menyimpannya) — langsung sync
        const isBridge = Boolean(account.metadata?.replizAccountId);
        const accessToken = isBridge ? "" : decrypt(account.accessTokenEnc!);
        const result = await syncAccountEngagement({
          account: {
            id: account.id,
            organizationId: account.organizationId,
            platform: account.platform,
            platformAccountId: account.platformAccountId,
            accessTokenEnc: account.accessTokenEnc,
            metadata: account.metadata,
          },
          accessToken,
        });
        // Update lastSyncedAt sukses ATAU gagal (hindari retry loop error token tiap tick)
        await db
          .update(socialAccount)
          .set({ lastSyncedAt: new Date() })
          .where(eq(socialAccount.id, account.id));
        return { account, result };
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        // decrypt gagal / exception tak terduga — catat, lanjut akun lain
        errors.push(
          outcome.reason instanceof Error
            ? outcome.reason.message.slice(0, 200)
            : String(outcome.reason),
        );
        continue;
      }
      const value = outcome.value;
      if (!value) continue; // akun tanpa token terenkripsi
      synced++;
      newItems += value.result.newItems;
      if (value.result.error) errors.push(`${value.result.platform}: ${value.result.error}`);
    }
  }

  return { synced, newItems, errors };
}
