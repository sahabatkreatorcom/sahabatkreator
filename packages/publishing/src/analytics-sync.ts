// Sinkronisasi analytics (insights) dari platform → tabel account_analytics + post_analytics
//
// Menjalankan fetch metrik akun (followers, dst) dan metrik post published
// (likes, comments, views, dst), lalu upsert snapshot harian:
// - account_analytics: unique (social_account_id, date)
// - post_analytics: unique (post_id, date) — snapshot kumulatif lifetime
//
// Endpoint insights per platform (riset docs/social-platforms, Sep 2026):
// - instagram (FB Login): graph.facebook.com — /{ig-id}?fields=followers_count,media_count
//   + /{media-id}/insights?metric=impressions,reach,saved
// - instagram_standalone: graph.instagram.com — /me?fields=followers_count,media_count
//   + /{media-id}/insights (metric likes,comments,shares,saves,views)
// - facebook: /{page-id}?fields=fan_count + /{post-id}?fields=reactions.summary,comments.summary,shares
// - threads: /{user-id}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count
// - tiktok: /v2/user/info/?fields=follower_count,likes_count,video_count + video/list (like/comment/share/view_count)
// - youtube: /youtube/v3/channels?part=statistics + /videos?part=statistics (batch id)
// - bluesky: app.bsky.actor.getProfile (public XRPC) + getPostThread
// - linkedin: /rest/socialActions/{urn} (post) — member followers tidak tersedia
// - pinterest: /v5/user_account?fields=follower_count + pin metrics via /v5/pins/{id} (aggregated)
// - google_business: businessprofileperformance.googleapis.com fetchMultiDailyMetricsTimeSeries

import { db } from "@sahabatkreator/db";
import { accountAnalytics, post, postAnalytics, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { LINKEDIN_API_VERSION, META_GRAPH_VERSION } from "./config";
import { decrypt } from "./crypto";
import { httpRequest } from "./http";

const GRAPH_VERSION = META_GRAPH_VERSION;
const GRAPH_FB = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_IG = `https://graph.instagram.com/${GRAPH_VERSION}`;
const GRAPH_THREADS = "https://graph.threads.net/v1.0";

/** ID generator — pola sama dengan apps/server/src/lib/id.ts (prefix sk_) */
function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}

/** Metrik akun hasil fetch */
export type AccountMetrics = {
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  impressions?: number | null;
  reach?: number | null;
  profileViews?: number | null;
  websiteClicks?: number | null;
};

/** Metrik post hasil fetch (kumulatif lifetime dari platform) */
export type PostMetrics = {
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  views?: number | null;
  impressions?: number | null;
  reach?: number | null;
  websiteClicks?: number | null;
};

/** Konteks akun untuk analytics sync (dipakai worker & route manual) */
export type AnalyticsAccount = {
  id: string;
  organizationId: string;
  platform: string;
  platformAccountId: string;
  username: string | null;
  accessTokenEnc: string | null;
  metadata: Record<string, unknown> | null;
};

/** Hasil satu siklus sync analytics akun */
export type AnalyticsSyncResult = {
  platform: string;
  accountSaved: boolean;
  postsSynced: number;
  error?: string;
};

function pageTokenOf(metadata: Record<string, unknown> | null): string | null {
  return typeof metadata?.pageAccessToken === "string" ? metadata.pageAccessToken : null;
}

// ---------------------------------------------------------------------------
// Upsert snapshot harian
// ---------------------------------------------------------------------------

/** Upsert account_analytics snapshot hari ini (unique social_account_id + date) */
export async function upsertAccountAnalytics(
  account: { id: string; organizationId: string; platform: string },
  metrics: AccountMetrics,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const values = {
    followers: metrics.followers ?? null,
    following: metrics.following ?? null,
    posts: metrics.posts ?? null,
    impressions: metrics.impressions ?? null,
    reach: metrics.reach ?? null,
    profileViews: metrics.profileViews ?? null,
    websiteClicks: metrics.websiteClicks ?? null,
  };
  await db
    .insert(accountAnalytics)
    .values({
      id: generateId("acca"),
      organizationId: account.organizationId,
      socialAccountId: account.id,
      platform: account.platform as never,
      date: today,
      ...values,
    })
    .onConflictDoUpdate({
      target: [accountAnalytics.socialAccountId, accountAnalytics.date],
      set: values,
    });
}

/** Upsert post_analytics snapshot hari ini (unique post_id + date) */
export async function upsertPostAnalytics(
  postRow: { id: string; organizationId: string; socialAccountId: string; platform: string },
  metrics: PostMetrics,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const values = {
    likes: metrics.likes ?? 0,
    comments: metrics.comments ?? 0,
    shares: metrics.shares ?? 0,
    saves: metrics.saves ?? 0,
    views: metrics.views ?? 0,
    impressions: metrics.impressions ?? 0,
    reach: metrics.reach ?? 0,
    websiteClicks: metrics.websiteClicks ?? 0,
  };
  await db
    .insert(postAnalytics)
    .values({
      id: generateId("posta"),
      organizationId: postRow.organizationId,
      postId: postRow.id,
      socialAccountId: postRow.socialAccountId,
      platform: postRow.platform as never,
      date: today,
      ...values,
    })
    .onConflictDoUpdate({
      target: [postAnalytics.postId, postAnalytics.date],
      set: values,
    });
}

// ---------------------------------------------------------------------------
// Fetch metrik akun per platform
// ---------------------------------------------------------------------------

export async function fetchAccountMetrics(
  platform: string,
  platformAccountId: string,
  accessToken: string,
  metadata: Record<string, unknown> | null,
): Promise<AccountMetrics> {
  switch (platform) {
    case "instagram":
      return igAccountMetrics(GRAPH_FB, platformAccountId, pageTokenOf(metadata) ?? accessToken);
    case "instagram_standalone":
      return igAccountMetrics(GRAPH_IG, platformAccountId, accessToken);
    case "facebook":
      return facebookAccountMetrics(platformAccountId, pageTokenOf(metadata) ?? accessToken);
    case "threads":
      return threadsAccountMetrics(platformAccountId, accessToken);
    case "tiktok":
      return tiktokAccountMetrics(accessToken);
    case "youtube":
      return youtubeAccountMetrics(platformAccountId, accessToken);
    case "bluesky":
      return blueskyAccountMetrics(platformAccountId);
    case "pinterest":
      return pinterestAccountMetrics(accessToken);
    case "linkedin":
      // Member personal: tidak ada endpoint follower count — skip
      return {};
    default:
      return {};
  }
}

/** Instagram (kedua jalur) — followers_count + media_count */
async function igAccountMetrics(
  base: string,
  igUserId: string,
  token: string,
): Promise<AccountMetrics> {
  const res = await httpRequest<{
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  }>(`${base}/${igUserId}`, {
    query: { fields: "followers_count,follows_count,media_count", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IG akun: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  return {
    followers: data.followers_count,
    following: data.follows_count,
    posts: data.media_count,
  };
}

/** Facebook Page — fan_count */
async function facebookAccountMetrics(pageId: string, token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    fan_count?: number;
    followers_count?: number;
  }>(`${GRAPH_FB}/${pageId}`, {
    query: { fields: "fan_count,followers_count", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FB akun: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  return { followers: data.followers_count ?? data.fan_count };
}

/** Threads — threads_insights (butuh ≥1 post; followers_count tersedia) */
async function threadsAccountMetrics(userId: string, token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    data?: Array<{ name: string; total_value?: number; values?: Array<{ value: number }> }>;
  }>(`${GRAPH_THREADS}/${userId}/threads_insights`, {
    query: { metric: "views,likes,replies,reposts,quotes,followers_count", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Threads insights: ${text.slice(0, 150)}`);
  }
  const data = (await res.json()).data ?? [];
  const byName = new Map(data.map((m) => [m.name, m.total_value ?? m.values?.[0]?.value ?? 0]));
  return {
    followers: byName.get("followers_count") ?? null,
    impressions: byName.get("views") ?? null,
  };
}

/** TikTok — user/info dengan stats (follower_count, likes_count, video_count) */
async function tiktokAccountMetrics(token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    data?: {
      user?: {
        follower_count?: number;
        following_count?: number;
        likes_count?: number;
        video_count?: number;
      };
    };
    error?: { message?: string };
  }>("https://open.tiktokapis.com/v2/user/info/", {
    query: { fields: "follower_count,following_count,likes_count,video_count" },
    headers: { Authorization: `Bearer ${token}` },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TikTok akun: ${text.slice(0, 150)}`);
  }
  const user = (await res.json()).data?.user;
  return {
    followers: user?.follower_count ?? null,
    following: user?.following_count ?? null,
    posts: user?.video_count ?? null,
  };
}

/** YouTube — channels?part=statistics (subscriberCount, viewCount, videoCount) */
async function youtubeAccountMetrics(channelId: string, token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    items?: Array<{
      statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
    }>;
  }>("https://www.googleapis.com/youtube/v3/channels", {
    query: { part: "statistics", id: channelId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YT channel: ${text.slice(0, 150)}`);
  }
  const stats = (await res.json()).items?.[0]?.statistics;
  return {
    followers: stats ? Number(stats.subscriberCount) || null : null,
    posts: stats ? Number(stats.videoCount) || null : null,
    impressions: stats ? Number(stats.viewCount) || null : null, // total views lifetime channel
  };
}

/** Bluesky — public XRPC getProfile (tidak butuh auth) */
async function blueskyAccountMetrics(did: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
  }>("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile", {
    query: { actor: did },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bluesky profil: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  return {
    followers: data.followersCount ?? null,
    following: data.followsCount ?? null,
    posts: data.postsCount ?? null,
  };
}

/** Pinterest — user_account dengan follower_count */
async function pinterestAccountMetrics(token: string): Promise<AccountMetrics> {
  const res = await httpRequest<{
    data?: { follower_count?: number; pin_count?: number; board_count?: number };
  }>("https://api.pinterest.com/v5/user_account", {
    query: { fields: "follower_count,pin_count,board_count" },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinterest akun: ${text.slice(0, 150)}`);
  }
  const data = (await res.json()).data;
  return { followers: data?.follower_count ?? null, posts: data?.pin_count ?? null };
}

// ---------------------------------------------------------------------------
// Fetch metrik post per platform
// ---------------------------------------------------------------------------

export async function fetchPostMetrics(
  platform: string,
  platformPostId: string,
  accessToken: string,
  metadata: Record<string, unknown> | null,
): Promise<PostMetrics> {
  switch (platform) {
    case "instagram":
      return igPostMetrics(GRAPH_FB, platformPostId, pageTokenOf(metadata) ?? accessToken);
    case "instagram_standalone":
      return igPostMetrics(GRAPH_IG, platformPostId, accessToken);
    case "facebook":
      return facebookPostMetrics(platformPostId, pageTokenOf(metadata) ?? accessToken);
    case "threads":
      return threadsPostMetrics(platformPostId, accessToken);
    case "tiktok":
      return tiktokPostMetrics(platformPostId, accessToken);
    case "youtube":
      return youtubePostMetrics(platformPostId, accessToken);
    case "bluesky":
      return blueskyPostMetrics(platformPostId);
    case "linkedin":
      return linkedinPostMetrics(platformPostId, accessToken);
    case "pinterest":
      return pinterestPostMetrics(platformPostId, accessToken);
    default:
      return {};
  }
}

/** Ambil nilai metric dari response insights Meta: [{name, values:[{value}]}] */
function metricValue(
  data: Array<{ name?: string; values?: Array<{ value?: number }> } | undefined> | undefined,
  name: string,
): number | null {
  const m = data?.find((d) => d?.name === name);
  const v = m?.values?.[0]?.value;
  return typeof v === "number" ? v : null;
}

/** Instagram media insights — beda metric valid per jalur, request dua-duanya */
async function igPostMetrics(base: string, mediaId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
  }>(`${base}/${mediaId}/insights`, {
    query: { metric: "impressions,reach,saved,likes,comments,shares,plays", access_token: token },
  });
  if (!res.ok) {
    // Beberapa media (mis. video pendek) menolak sebagian metric — retry minimal
    const text = await res.text().catch(() => "");
    throw new Error(`IG insights: ${text.slice(0, 150)}`);
  }
  const data = (await res.json()).data ?? [];
  return {
    impressions: metricValue(data, "impressions"),
    reach: metricValue(data, "reach"),
    saves: metricValue(data, "saved"),
    likes: metricValue(data, "likes"),
    comments: metricValue(data, "comments"),
    shares: metricValue(data, "shares"),
    views: metricValue(data, "plays"),
  };
}

/** Facebook post — reactions + comments summary + shares */
async function facebookPostMetrics(postId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
  }>(`${GRAPH_FB}/${postId}`, {
    query: {
      fields: "reactions.summary(total_count),comments.summary(total_count),shares",
      access_token: token,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FB post: ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  return {
    likes: data.reactions?.summary?.total_count ?? null,
    comments: data.comments?.summary?.total_count ?? null,
    shares: data.shares?.count ?? null,
  };
}

/** Threads media insights — views, likes, reposts, quotes */
async function threadsPostMetrics(mediaId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    data?: Array<{ name?: string; values?: Array<{ value: number }> }>;
  }>(`${GRAPH_THREADS}/${mediaId}/insights`, {
    query: { metric: "views,likes,reposts,quotes", access_token: token },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Threads media insights: ${text.slice(0, 150)}`);
  }
  const data = (await res.json()).data ?? [];
  return {
    views: metricValue(data, "views"),
    likes: metricValue(data, "likes"),
    shares: metricValue(data, "reposts"),
  };
}

/** TikTok video metrics — query via video/list filter by video_id */
async function tiktokPostMetrics(videoId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    data?: {
      videos?: Array<{
        like_count?: number;
        comment_count?: number;
        share_count?: number;
        view_count?: number;
      }>;
    };
    error?: { message?: string };
  }>("https://open.tiktokapis.com/v2/video/list/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ filters: [{ video_ids: [videoId] }], max_count: 1 }),
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TikTok video: ${text.slice(0, 150)}`);
  }
  const video = (await res.json()).data?.videos?.[0];
  if (!video) return {};
  return {
    likes: video.like_count ?? null,
    comments: video.comment_count ?? null,
    shares: video.share_count ?? null,
    views: video.view_count ?? null,
  };
}

/** YouTube video statistics (viewCount, likeCount, commentCount) */
async function youtubePostMetrics(videoId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    items?: Array<{
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    }>;
  }>("https://www.googleapis.com/youtube/v3/videos", {
    query: { part: "statistics", id: videoId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YT video: ${text.slice(0, 150)}`);
  }
  const stats = (await res.json()).items?.[0]?.statistics;
  if (!stats) return {};
  return {
    views: Number(stats.viewCount) || null,
    likes: Number(stats.likeCount) || null,
    comments: Number(stats.commentCount) || null,
  };
}

/** Bluesky post thread — likeCount, repostCount, replyCount (public XRPC) */
async function blueskyPostMetrics(uri: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    thread?: { post?: { likeCount?: number; repostCount?: number; replyCount?: number } };
  }>("https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread", {
    query: { uri },
    retries: 1,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bluesky thread: ${text.slice(0, 150)}`);
  }
  const p = (await res.json()).thread?.post;
  if (!p) return {};
  return {
    likes: p.likeCount ?? null,
    shares: p.repostCount ?? null,
    comments: p.replyCount ?? null,
  };
}

/** LinkedIn socialActions — likes + comments (urn:li:share:xxx / person) */
async function linkedinPostMetrics(postUrn: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    elements?: Array<{
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { aggregatedTotalComments?: number };
    }>;
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { aggregatedTotalComments?: number };
  }>("https://api.linkedin.com/rest/socialActions", {
    query: { ids: `List(${postUrn})` },
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LinkedIn socialActions: ${text.slice(0, 150)}`);
  }
  // Batch response: { elements: [{...likesSummary, commentsSummary}] } atau objek tunggal
  const data = await res.json();
  const el = data.elements?.[0] ?? data;
  return {
    likes: el?.likesSummary?.totalLikes ?? null,
    comments: el?.commentsSummary?.aggregatedTotalComments ?? null,
  };
}

/** Pinterest pin metrics — impressions/saves/clicks via pin detail (aggregated stats) */
async function pinterestPostMetrics(pinId: string, token: string): Promise<PostMetrics> {
  const res = await httpRequest<{
    data?: {
      metrics?: {
        impressions?: number;
        saves?: number;
        clicks?: number;
        reactions?: number;
        comment_count?: number;
      };
    };
  }>(`https://api.pinterest.com/v5/pins/${pinId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pinterest pin: ${text.slice(0, 150)}`);
  }
  const metrics = (await res.json()).data?.metrics;
  if (!metrics) return {};
  return {
    impressions: metrics.impressions ?? null,
    saves: metrics.saves ?? null,
    websiteClicks: metrics.clicks ?? null,
    likes: metrics.reactions ?? null,
    comments: metrics.comment_count ?? null,
  };
}

// ---------------------------------------------------------------------------
// Sync satu akun (metrik akun + post published terbaru)
// ---------------------------------------------------------------------------

/**
 * Sync analytics satu akun: metrik akun + metrik max 10 post published terbaru
 * yang punya platformPostId. Snapshot per-post error tidak menghentikan lainnya.
 */
export async function syncAccountAnalytics(
  account: AnalyticsAccount,
  accessToken: string,
): Promise<AnalyticsSyncResult> {
  const result: AnalyticsSyncResult = {
    platform: account.platform,
    accountSaved: false,
    postsSynced: 0,
  };
  try {
    const metrics = await fetchAccountMetrics(
      account.platform,
      account.platformAccountId,
      accessToken,
      account.metadata,
    );
    if (Object.values(metrics).some((v) => v !== null && v !== undefined)) {
      await upsertAccountAnalytics(
        { id: account.id, organizationId: account.organizationId, platform: account.platform },
        metrics,
      );
      result.accountSaved = true;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message.slice(0, 200) : String(error);
  }

  // Post published terbaru milik akun ini (punya platformPostId)
  let posts: Array<{ id: string; platformPostId: string }>;
  try {
    const rows = await db
      .select({ id: post.id, platformPostId: post.platformPostId })
      .from(post)
      .where(and(eq(post.socialAccountId, account.id), eq(post.status, "published")))
      .limit(200);
    posts = rows.filter((p): p is { id: string; platformPostId: string } =>
      Boolean(p.platformPostId),
    );
  } catch {
    return result;
  }

  // Post terbaru yang belum punya snapshot hari ini disinkron (10 terakhir cukup)
  const today = new Date().toISOString().slice(0, 10);
  let alreadySynced: Set<string>;
  try {
    const existing = await db
      .select({ postId: postAnalytics.postId })
      .from(postAnalytics)
      .where(
        and(
          eq(postAnalytics.socialAccountId, account.id),
          eq(postAnalytics.date, today),
          posts.length > 0
            ? inArray(
                postAnalytics.postId,
                posts.map((p) => p.id),
              )
            : undefined,
        ),
      );
    alreadySynced = new Set(existing.map((r) => r.postId));
  } catch {
    alreadySynced = new Set();
  }

  // Prioritaskan post terbaru (publishedAt desc tidak di-select untuk hemat — urutan insert ok)
  const targets = posts
    .slice(0, 10 + alreadySynced.size)
    .filter((p) => !alreadySynced.has(p.id))
    .slice(0, 10);

  for (const p of targets) {
    try {
      const metrics = await fetchPostMetrics(
        account.platform,
        p.platformPostId!,
        accessToken,
        account.metadata,
      );
      await upsertPostAnalytics(
        {
          id: p.id,
          organizationId: account.organizationId,
          socialAccountId: account.id,
          platform: account.platform,
        },
        metrics,
      );
      result.postsSynced++;
    } catch {
      // Post tertentu gagal (deleted di platform, API error) — lanjut post lain
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sinkronisasi massal — dipakai worker
// ---------------------------------------------------------------------------

/**
 * Sync analytics akun yang due (lastAnalyticsAt tidak ada di schema — pakai
 * snapshot terakhir account_analytics: akun tanpa snapshot hari ini = due).
 * Interval 6 jam (metrik berubah lambat, hemat rate limit).
 * Akun diproses paralel dalam batch kecil — satu akun gagal tidak
 * menghentikan batch lainnya (Promise.allSettled).
 */
export async function syncDueAnalyticsAccounts(
  maxAccounts = 10,
): Promise<{ synced: number; postsSynced: number; errors: string[] }> {
  const BATCH_SIZE = 3;
  const today = new Date().toISOString().slice(0, 10);

  // Akun connected non-manual
  const accounts = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      username: socialAccount.username,
      accessTokenEnc: socialAccount.accessTokenEnc,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(eq(socialAccount.isConnected, true))
    .limit(maxAccounts * 3);

  // Filter: platform dengan dukungan analytics + belum ada snapshot hari ini
  const supported = new Set([
    "instagram",
    "instagram_standalone",
    "facebook",
    "threads",
    "tiktok",
    "youtube",
    "bluesky",
    "pinterest",
  ]);
  const candidates = accounts.filter((a) => a.accessTokenEnc && supported.has(a.platform));

  const syncedToday = await db
    .selectDistinct({ socialAccountId: accountAnalytics.socialAccountId })
    .from(accountAnalytics)
    .where(
      candidates.length > 0
        ? and(
            eq(accountAnalytics.date, today),
            inArray(
              accountAnalytics.socialAccountId,
              candidates.map((a) => a.id),
            ),
          )
        : eq(accountAnalytics.date, today),
    );
  const syncedIds = new Set(syncedToday.map((r) => r.socialAccountId));
  const due = candidates.filter((a) => !syncedIds.has(a.id)).slice(0, maxAccounts);

  let synced = 0;
  let postsSynced = 0;
  const errors: string[] = [];

  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const batch = due.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (account) => {
        const accessToken = decrypt(account.accessTokenEnc!);
        return syncAccountAnalytics(account, accessToken);
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
      synced++;
      postsSynced += outcome.value.postsSynced;
      if (outcome.value.error) errors.push(`${outcome.value.platform}: ${outcome.value.error}`);
    }
  }

  return { synced, postsSynced, errors };
}
