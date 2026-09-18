// Sinkronisasi analytics (insights) dari platform → tabel account_analytics + post_analytics
//
// Menjalankan fetch metrik akun (followers, dst) dan metrik post published
// (likes, comments, views, dst), lalu upsert snapshot harian:
// - account_analytics: unique (social_account_id, date)
// - post_analytics: unique (post_id, date) — snapshot kumulatif lifetime
//
// Endpoint insights per platform (riset docs/social-platforms, Sep 2026):
// - instagram (FB Login): graph.facebook.com — /{ig-id}?fields=followers_count,media_count
//   + /{ig-id}/insights (reach,profile_views,website_clicks)
//   + /{media-id}/insights (reach,likes,comments,shares,saved,views)
// - instagram_standalone: graph.instagram.com — /me?fields=followers_count,media_count
//   + /{ig-id}/insights (reach,profile_views,website_clicks)
//   + /{media-id}/insights (reach,likes,comments,shares,saves,views)
// - facebook: /{page-id}?fields=fan_count + /{post-id}?fields=reactions.summary,comments.summary,shares
// - threads: /{user-id}/threads_insights?metric=views,likes,replies,reposts,quotes,followers_count
// - tiktok: /v2/user/info/?fields=follower_count,likes_count,video_count + video/list (like/comment/share/view_count)
// - youtube: /youtube/v3/channels?part=statistics + /videos?part=statistics (batch id)
// - bluesky: app.bsky.actor.getProfile (public XRPC) + getPostThread
// - linkedin: /rest/socialActions/{urn} (post) — member followers tidak tersedia
//   (dipakai juga oleh linkedin_org: post organization)
// - google_business: businessprofileperformance.googleapis.com fetchMultiDailyMetricsTimeSeries

import { db } from "@sahabatkreator/db";
import { accountAnalytics, post, postAnalytics, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  BSKY_APPVIEW_URL,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_REST_URL,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "./config";
import { decrypt } from "./crypto";
import { httpRequest } from "./http";

const GRAPH_FB = GRAPH_FB_URL;
const GRAPH_IG = GRAPH_IG_URL;
const GRAPH_THREADS = GRAPH_THREADS_URL;

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
    case "linkedin":
    case "linkedin_org":
      return linkedinAccountMetrics(platformAccountId, accessToken);
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
  // Account insights opsional — bila izin/metric belum tersedia tetap simpan followers dkk.
  const insights = await igAccountInsights(base, igUserId, token);
  return {
    followers: data.followers_count,
    following: data.follows_count,
    posts: data.media_count,
    ...insights,
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
  }>(`${TIKTOK_OPEN_API_URL}/user/info/`, {
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
  }>(`${YOUTUBE_API_URL}/channels`, {
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
  }>(`${BSKY_APPVIEW_URL}/xrpc/app.bsky.actor.getProfile`, {
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

/**
 * LinkedIn — organization entity profile (followerCount, name).
 * Untuk personal profile, follower count tidak tersedia tanpa scope tambahan.
 * Untuk organization pages, gunakan endpoint v2/entities/{orgUrn} yang tersedia
 * dengan scope r_organization_social.
 */
async function linkedinAccountMetrics(
  platformAccountId: string,
  token: string,
): Promise<AccountMetrics> {
  // Hanya fetch untuk organization URN (urn:li:organization:{id})
  if (!platformAccountId.startsWith("urn:li:organization:")) {
    return {};
  }
  const res = await httpRequest<{
    followerCount?: number;
    name?: string;
    localizedDescription?: string;
  }>(`${LINKEDIN_REST_URL}/v2/entities/${encodeURIComponent(platformAccountId)}`, {
    query: { projection: "(followerCount,name,localizedDescription)" },
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (!res.ok) {
    // May fail if scope r_organization_followers is not granted — graceful fallback
    return {};
  }
  const data = await res.json();
  return {
    followers: data.followerCount ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fetch metrik post per platform
// ---------------------------------------------------------------------------

export async function fetchPostMetrics(
  platform: string,
  platformPostId: string,
  accessToken: string,
  metadata: Record<string, unknown> | null,
  ownerUrn?: string,
): Promise<PostMetrics> {
  switch (platform) {
    case "instagram":
      return igPostMetrics(
        GRAPH_FB,
        platformPostId,
        pageTokenOf(metadata) ?? accessToken,
        IG_MEDIA_METRICS_FB,
      );
    case "instagram_standalone":
      return igPostMetrics(GRAPH_IG, platformPostId, accessToken, IG_MEDIA_METRICS_IG);
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
    case "linkedin_org":
      return linkedinPostMetrics(platformPostId, accessToken, ownerUrn);
    default:
      return {};
  }
}

type MetaInsight = {
  name?: string;
  values?: Array<{ value?: number }>;
  total_value?: { value?: number };
};

/** Ambil nilai metric dari response insights Meta: [{name, values:[{value}]}] */
function metricValue(
  data: Array<MetaInsight | undefined> | undefined,
  name: string,
): number | null {
  const m = data?.find((d) => d?.name === name);
  const v = m?.values?.[0]?.value ?? m?.total_value?.value;
  return typeof v === "number" ? v : null;
}

// Metric media insights Instagram berbeda antar host:
// - graph.facebook.com (FB Login): `saved` (singular); `impressions`/`plays` sudah
//   deprecated → digantikan `views`
// - graph.instagram.com (IG Login): `saves` (plural); tidak mengenal `impressions`/`plays`
// `reach` valid untuk semua tipe media → dipakai sebagai fallback bila metric lengkap ditolak.
const IG_MEDIA_METRICS_FB = "reach,likes,comments,shares,saved,views";
const IG_MEDIA_METRICS_IG = "reach,likes,comments,shares,saves,views";
const IG_MEDIA_METRICS_FALLBACK = "reach";

/** Satu request media insights — kembalikan data atau pesan error (tanpa throw) */
async function requestIgMediaInsights(
  base: string,
  mediaId: string,
  token: string,
  metric: string,
): Promise<{ data?: MetaInsight[]; error?: string }> {
  const res = await httpRequest<{ data?: MetaInsight[] }>(`${base}/${mediaId}/insights`, {
    query: { metric, access_token: token },
  });
  if (res.ok) return { data: (await res.json()).data ?? [] };
  const text = await res.text().catch(() => "");
  return { error: text.slice(0, 150) };
}

/**
 * Instagram media insights — metric spesifik host. Bila sebagian metric ditolak untuk
 * tipe media tertentu (mis. `views` untuk image), coba tanpa `views`, lalu `reach` saja.
 */
async function igPostMetrics(
  base: string,
  mediaId: string,
  token: string,
  metrics: string,
): Promise<PostMetrics> {
  const attempts = [metrics, metrics.replace(",views", ""), IG_MEDIA_METRICS_FALLBACK];
  let result: { data?: MetaInsight[]; error?: string } = { error: "tidak ada percobaan" };
  for (const metric of attempts) {
    result = await requestIgMediaInsights(base, mediaId, token, metric);
    if (!result.error) break;
  }
  if (result.error) throw new Error(`IG insights: ${result.error}`);

  const data = result.data ?? [];
  return {
    // `impressions` deprecated di kedua host → fallback ke `views` agar dashboard tetap terisi
    impressions: metricValue(data, "impressions") ?? metricValue(data, "views"),
    reach: metricValue(data, "reach"),
    saves: metricValue(data, "saved") ?? metricValue(data, "saves"),
    likes: metricValue(data, "likes"),
    comments: metricValue(data, "comments"),
    shares: metricValue(data, "shares"),
    views: metricValue(data, "views") ?? metricValue(data, "plays"),
  };
}

/**
 * Account-level insights Instagram (reach, profile_views, website_clicks).
 * Butuh `instagram_manage_insights` (FB Login) / `instagram_business_manage_insights`
 * (IG Login). Sebagian metric ditolak bila akun belum memenuhi syarat (mis. <100 follower)
 * → jangan gagalkan sync, cukup kembalikan apa adanya.
 */
async function igAccountInsights(
  base: string,
  igUserId: string,
  token: string,
): Promise<AccountMetrics> {
  const res = await httpRequest<{ data?: MetaInsight[] }>(`${base}/${igUserId}/insights`, {
    query: { metric: "reach,profile_views,website_clicks", period: "day", access_token: token },
  });
  if (!res.ok) return {};
  const data = (await res.json()).data ?? [];
  return {
    reach: metricValue(data, "reach"),
    profileViews: metricValue(data, "profile_views"),
    websiteClicks: metricValue(data, "website_clicks"),
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
  }>(`${TIKTOK_OPEN_API_URL}/video/list/`, {
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
  }>(`${YOUTUBE_API_URL}/videos`, {
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
  }>(`${BSKY_APPVIEW_URL}/xrpc/app.bsky.feed.getPostThread`, {
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

/**
 * LinkedIn socialActions — likes + comments per-post (urn:li:share:* / ugcPost:*).
 * Pakai endpoint single-entity `/{urn}`, BUKAN `?ids=List(...)`, karena:
 * - respons batch memakai key `results` yang di-key URN (bukan `elements`)
 * - BATCH_GET tidak didukung di Development tier Community Management API
 * Post tanpa social action mengembalikan objek kosong — bukan error.
 *
 * Bila ownerUrn (organizationalEntity) tersedia, ALSO fetch impressions/clicks/shares
 * via organizationalEntityShareStatistics — endpoint ini memberikan metrik komprehensif
 * yang tidak tersedia di socialActions.
 */
async function linkedinPostMetrics(
  postUrn: string,
  token: string,
  ownerUrn?: string,
): Promise<PostMetrics> {
  // 1. Social actions: likes + comments
  const actionsRes = await httpRequest<{
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { aggregatedTotalComments?: number };
  }>(`${LINKEDIN_REST_URL}/rest/socialActions/${encodeURIComponent(postUrn)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": LINKEDIN_API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  let likes: number | null = null;
  let comments: number | null = null;
  if (actionsRes.ok) {
    const data = await actionsRes.json();
    likes = data.likesSummary?.totalLikes ?? null;
    comments = data.commentsSummary?.aggregatedTotalComments ?? null;
  }

  // 2. Share statistics (impressions, clicks, shares) — requires organizationalEntity
  //    Only available for organization pages with r_organization_social scope
  if (ownerUrn?.startsWith("urn:li:organization:")) {
    try {
      const statsRes = await httpRequest<{
        elements?: Array<{
          totalShareStatistics?: {
            impressionCount?: number;
            uniqueImpressionsCount?: number;
            clickCount?: number;
            shareCount?: number;
            likeCount?: number;
            commentCount?: number;
          };
        }>;
      }>(
        `${LINKEDIN_REST_URL}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(ownerUrn)}&shares=List(${encodeURIComponent(postUrn)})`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "LinkedIn-Version": LINKEDIN_API_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        },
      );
      if (statsRes.ok) {
        const stats = (await statsRes.json()).elements?.[0]?.totalShareStatistics;
        if (stats) {
          return {
            likes: stats.likeCount ?? likes,
            comments: stats.commentCount ?? comments,
            impressions: stats.impressionCount ?? null,
            reach: stats.uniqueImpressionsCount ?? null,
            shares: stats.shareCount ?? null,
            websiteClicks: stats.clickCount ?? null,
          };
        }
      }
    } catch {
      // Share statistics endpoint may fail for personal posts or missing scope — fallback to socialActions only
    }
  }

  return { likes, comments };
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
      if (!p.platformPostId) continue;
      const metrics = await fetchPostMetrics(
        account.platform,
        p.platformPostId,
        accessToken,
        account.metadata,
        account.platformAccountId,
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
  // Pinterest dikecualikan — Developer Guidelines melarang penyimpanan data analytics.
  // Pinterest analytics di-fetch on-demand via endpoint /analytics/pinterest.
  const supported = new Set([
    "instagram",
    "instagram_standalone",
    "facebook",
    "threads",
    "tiktok",
    "youtube",
    "bluesky",
    "linkedin",
    "linkedin_org",
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
        if (!account.accessTokenEnc) return { platform: account.platform, accountSaved: false, postsSynced: 0, error: "Token tidak tersedia" };
        const accessToken = decrypt(account.accessTokenEnc);
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
