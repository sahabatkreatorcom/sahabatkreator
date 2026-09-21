// SEB — impact check rekomendasi: bandingkan analytics 30 hari sebelum vs
// sesudah rekomendasi ditandai selesai (before/after window).
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../index";
import { post, sebRecommendation } from "../schema";

export type ImpactMetrics = {
  engagementRateAvg: number | null;
  impressionsSum: number;
  reachSum: number;
  likesSum: number;
  commentsSum: number;
  sharesSum: number;
  savesSum: number;
  viewsSum: number;
  postCount: number;
};

export type ImpactResult = {
  before: ImpactMetrics;
  after: ImpactMetrics;
  deltas: {
    engagementRatePct: number | null;
    impressionsPct: number | null;
    reachPct: number | null;
    likesPct: number | null;
    commentsPct: number | null;
    sharesPct: number | null;
    savesPct: number | null;
    viewsPct: number | null;
    postCountDiff: number;
  };
  checkedAt: string;
  windowDays: number;
};

const WINDOW_DAYS = 30;

function pctChange(before: number, after: number): number | null {
  if (before <= 0) return after > 0 ? 100 : null;
  return Math.round(((after - before) / before) * 1000) / 10;
}

/** Agregasi metrik post org pada rentang tanggal (snapshot terbaru per post) */
async function aggregateWindow(
  organizationId: string,
  socialAccountId: string | null,
  from: Date,
  to: Date,
): Promise<ImpactMetrics> {
  const conditions = [
    eq(post.organizationId, organizationId),
    eq(post.status, "published"),
    gte(post.publishedAt, from),
    lte(post.publishedAt, to),
  ];
  if (socialAccountId) {
    conditions.push(eq(post.socialAccountId, socialAccountId));
  }

  const result = await db.execute(sql`
    select distinct on (pa.post_id)
      pa.likes, pa.comments, pa.shares, pa.saves, pa.views, pa.impressions, pa.reach
    from post_analytics pa
    join ${post} p on p.id = pa.post_id
    where ${and(...conditions)}
    order by pa.post_id, pa.date desc
  `);
  const rows = result.rows as Array<{
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    views: string | number;
    impressions: string | number;
    reach: string | number;
  }>;

  const metrics: ImpactMetrics = {
    engagementRateAvg: null,
    impressionsSum: 0,
    reachSum: 0,
    likesSum: 0,
    commentsSum: 0,
    sharesSum: 0,
    savesSum: 0,
    viewsSum: 0,
    postCount: rows.length,
  };
  let totalEngagement = 0;
  for (const r of rows) {
    metrics.likesSum += r.likes;
    metrics.commentsSum += r.comments;
    metrics.sharesSum += r.shares;
    metrics.savesSum += r.saves;
    metrics.viewsSum += Number(r.views);
    metrics.impressionsSum += Number(r.impressions);
    metrics.reachSum += Number(r.reach);
    totalEngagement += r.likes + r.comments + r.shares + r.saves;
  }
  if (metrics.impressionsSum > 0 && rows.length > 0) {
    metrics.engagementRateAvg =
      Math.round((totalEngagement / metrics.impressionsSum) * 10000) / 100;
  }
  return metrics;
}

/** Jalankan impact check untuk satu rekomendasi — simpan impactResult */
export async function checkSebRecommendationImpact(
  organizationId: string,
  recommendationId: string,
): Promise<ImpactResult> {
  const [rec] = await db
    .select()
    .from(sebRecommendation)
    .where(
      and(
        eq(sebRecommendation.id, recommendationId),
        eq(sebRecommendation.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!rec) throw new Error("Rekomendasi tidak ditemukan");

  const anchor = rec.completedAt ?? rec.updatedAt;
  const after = anchor;
  const before = new Date(after.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const from = new Date(before.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [beforeMetrics, afterMetrics] = await Promise.all([
    aggregateWindow(organizationId, rec.socialAccountId, from, before),
    aggregateWindow(organizationId, rec.socialAccountId, before, after),
  ]);

  const result: ImpactResult = {
    before: beforeMetrics,
    after: afterMetrics,
    deltas: {
      engagementRatePct:
        beforeMetrics.engagementRateAvg != null && afterMetrics.engagementRateAvg != null
          ? pctChange(beforeMetrics.engagementRateAvg, afterMetrics.engagementRateAvg)
          : null,
      impressionsPct: pctChange(beforeMetrics.impressionsSum, afterMetrics.impressionsSum),
      reachPct: pctChange(beforeMetrics.reachSum, afterMetrics.reachSum),
      likesPct: pctChange(beforeMetrics.likesSum, afterMetrics.likesSum),
      commentsPct: pctChange(beforeMetrics.commentsSum, afterMetrics.commentsSum),
      sharesPct: pctChange(beforeMetrics.sharesSum, afterMetrics.sharesSum),
      savesPct: pctChange(beforeMetrics.savesSum, afterMetrics.savesSum),
      viewsPct: pctChange(beforeMetrics.viewsSum, afterMetrics.viewsSum),
      postCountDiff: afterMetrics.postCount - beforeMetrics.postCount,
    },
    checkedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
  };

  await db
    .update(sebRecommendation)
    .set({
      impactResult: result as unknown as Record<string, unknown>,
      impactCheckedAt: new Date(),
    })
    .where(eq(sebRecommendation.id, recommendationId));

  return result;
}
