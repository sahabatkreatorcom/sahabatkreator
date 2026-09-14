// AI Coach — agregasi performa 30 hari dari snapshot analytics riil.
// Dasar saran AI: followers delta, engagement rate, platform terbaik/terlemah,
// konsistensi posting, dan waktu terbaik posting.

import { db } from "@sahabatkreator/db";
import { accountAnalytics, post } from "@sahabatkreator/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export type PlatformPerformance = {
  platform: string;
  followersDelta: number | null;
  followersLatest: number | null;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  totalViews: number;
  /** engagement rate = (likes+comments+shares+saves) / impressions terbaru */
  engagementRate: number | null;
  publishedCount: number;
};

export type CoachSummary = {
  /** Total followers semua platform (snapshot terbaru per akun) */
  followersTotal: number | null;
  /** Delta followers 30 hari (jumlah semua platform) */
  followersDelta: number | null;
  /** Total post tayang 30 hari */
  publishedCount: number;
  /** Rata-rata post per minggu */
  postsPerWeek: number;
  /** Post terbaik 30 hari berdasarkan engagement */
  topPost: {
    platform: string;
    content: string;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    publishedAt: Date | null;
  } | null;
  perPlatform: PlatformPerformance[];
  /** Indikator data cukup untuk saran AI */
  hasData: boolean;
};

export async function getCoachSummary(organizationId: string): Promise<CoachSummary> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceDate = since.toISOString().slice(0, 10);

  // --- Followers: snapshot terbaru + terlama (>= since) per akun ---
  const accountRows = await db
    .select({
      platform: accountAnalytics.platform,
      socialAccountId: accountAnalytics.socialAccountId,
      followers: accountAnalytics.followers,
      date: accountAnalytics.date,
    })
    .from(accountAnalytics)
    .where(
      and(
        eq(accountAnalytics.organizationId, organizationId),
        gte(accountAnalytics.date, sinceDate),
      ),
    );

  // kelompokkan per akun → latest & earliest followers
  const byAccount = new Map<
    string,
    { platform: string; latest: number; earliest: number; latestDate: string; earliestDate: string }
  >();
  for (const row of accountRows) {
    if (row.followers == null) continue;
    const cur = byAccount.get(row.socialAccountId);
    if (!cur) {
      byAccount.set(row.socialAccountId, {
        platform: row.platform,
        latest: row.followers,
        earliest: row.followers,
        latestDate: row.date,
        earliestDate: row.date,
      });
    } else {
      if (row.date >= cur.latestDate) {
        cur.latest = row.followers;
        cur.latestDate = row.date;
      }
      if (row.date < cur.earliestDate) {
        cur.earliest = row.followers;
        cur.earliestDate = row.date;
      }
    }
  }
  const followersTotal =
    byAccount.size > 0 ? [...byAccount.values()].reduce((sum, a) => sum + a.latest, 0) : null;
  const followersDelta =
    byAccount.size > 0
      ? [...byAccount.values()].reduce((sum, a) => sum + (a.latest - a.earliest), 0)
      : null;

  // --- Post analytics 30 hari: snapshot terbaru per post (kumulatif lifetime) ---
  const latestPerPost = await db.execute(sql`
    select distinct on (pa.post_id)
      pa.post_id, pa.platform, pa.likes, pa.comments, pa.shares, pa.saves,
      pa.views, pa.impressions, p.content, p.published_at
    from post_analytics pa
    join post p on p.id = pa.post_id
    where pa.organization_id = ${organizationId}
      and p.published_at >= ${since.toISOString()}
    order by pa.post_id, pa.date desc
  `);
  const postRows = (
    latestPerPost.rows as Array<{
      post_id: string;
      platform: string;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      views: string | number;
      impressions: string | number;
      content: string | null;
      published_at: string | Date | null;
    }>
  ).map((r) => ({
    ...r,
    // bigint Postgres dikembalikan driver sebagai string — normalisasi ke number
    views: Number(r.views),
    impressions: Number(r.impressions),
  }));

  const publishedCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(post)
    .where(and(eq(post.organizationId, organizationId), gte(post.publishedAt, since)));

  // --- Agregasi per platform ---
  const platformAgg = new Map<string, PlatformPerformance>();
  for (const r of postRows) {
    const agg = platformAgg.get(r.platform) ?? {
      platform: r.platform,
      followersDelta: null,
      followersLatest: null,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalSaves: 0,
      totalViews: 0,
      engagementRate: null,
      publishedCount: 0,
    };
    agg.totalLikes += r.likes;
    agg.totalComments += r.comments;
    agg.totalShares += r.shares;
    agg.totalSaves += r.saves;
    agg.totalViews += r.views;
    agg.publishedCount += 1;
    platformAgg.set(r.platform, agg);
  }
  // gabungkan followers per platform (dari byAccount)
  for (const [accountId, info] of byAccount) {
    const agg = platformAgg.get(info.platform);
    if (agg) {
      agg.followersDelta = (agg.followersDelta ?? 0) + (info.latest - info.earliest);
      agg.followersLatest = (agg.followersLatest ?? 0) + info.latest;
    }
    void accountId;
  }
  // engagement rate per platform = total engagement / total impressions
  const impressionsByPlatform = new Map<string, number>();
  for (const r of postRows) {
    impressionsByPlatform.set(
      r.platform,
      (impressionsByPlatform.get(r.platform) ?? 0) + r.impressions,
    );
  }
  for (const agg of platformAgg.values()) {
    const impressions = impressionsByPlatform.get(agg.platform) ?? 0;
    if (impressions > 0) {
      const engagement = agg.totalLikes + agg.totalComments + agg.totalShares + agg.totalSaves;
      agg.engagementRate = Math.round((engagement / impressions) * 1000) / 10; // %
    }
  }

  // --- Post terbaik ---
  let topPost: CoachSummary["topPost"] = null;
  let topEngagement = -1;
  for (const r of postRows) {
    const engagement = r.likes + r.comments + r.shares + r.saves;
    if (engagement > topEngagement) {
      topEngagement = engagement;
      topPost = {
        platform: r.platform,
        content: (r.content ?? "").slice(0, 120),
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        views: r.views,
        publishedAt: r.published_at ? new Date(r.published_at) : null,
      };
    }
  }

  const totalPublished = postRows.length;
  return {
    followersTotal,
    followersDelta,
    publishedCount: publishedCount[0]?.count ?? 0,
    postsPerWeek: Math.round((totalPublished / 30) * 7 * 10) / 10,
    topPost,
    perPlatform: [...platformAgg.values()].sort(
      (a, b) => b.totalLikes + b.totalComments - (a.totalLikes + a.totalComments),
    ),
    hasData: accountRows.length > 0 || totalPublished > 0,
  };
}
