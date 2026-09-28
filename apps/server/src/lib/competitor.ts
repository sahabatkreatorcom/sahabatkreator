// Competitor Intelligence — benchmark performa org vs kompetitor yang di-track.
// Data kompetitor di-input manual (legal); data org dari snapshot analytics riil.

import { db } from "@sahabatkreator/db";
import { competitor } from "@sahabatkreator/db/schema";
import { eq, sql } from "drizzle-orm";

/** Performa org 30 hari — untuk benchmark */
export type OrgPerformance = {
  followers: number;
  engagementRate: number | null; // %
  postsPerWeek: number;
};

/** Metrik agregat kompetitor */
export type CompetitorAggregate = {
  count: number;
  avgFollowers: number;
  /** % rata-rata (basis 0.01 → integer x100) */
  avgEngagementRateBp: number | null;
  avgPostsPerWeek: number | null;
};

/** Satu baris kompetitor + skor benchmark vs org */
export type CompetitorRow = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number;
  /** % (basis 0.01) */
  avgEngagementRateBp: number | null;
  postsPerWeek: number | null;
  isVerified: boolean;
  notes: string | null;
  engagementHistory: { date: string; followers: number; engagementRate: number }[];
  updatedAt: string;
  /** Skor benchmark 0-100: followers+engagement+konsistensi (100 = sekelas top kompetitor) */
  benchmarkScore: number;
};

async function getOrgPerformance(organizationId: string): Promise<OrgPerformance> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Followers terbaru per akun
  const followersRes = await db.execute(sql`
    select distinct on (social_account_id) followers
    from account_analytics
    where organization_id = ${organizationId} and followers is not null
    order by social_account_id, date desc
  `);
  const followers = (followersRes.rows as { followers: number }[]).reduce(
    (sum, r) => sum + Number(r.followers),
    0,
  );

  // Engagement + impressions dari snapshot post terbaru per post
  const postAgg = await db.execute(sql`
    select
      sum(likes + comments + shares + saves)::bigint as engagement,
      sum(impressions)::bigint as impressions,
      count(*)::int as post_count
    from (
      select distinct on (pa.post_id) pa.*
      from post_analytics pa
      join post p on p.id = pa.post_id
      where pa.organization_id = ${organizationId}
        and p.published_at >= ${since.toISOString()}
      order by pa.post_id, pa.date desc
    ) latest
  `);
  const agg = (postAgg.rows[0] ?? {}) as {
    engagement?: string | number;
    impressions?: string | number;
    post_count?: number;
  };
  const engagement = Number(agg.engagement ?? 0);
  const impressions = Number(agg.impressions ?? 0);
  const postCount = Number(agg.post_count ?? 0);

  return {
    followers,
    engagementRate: impressions > 0 ? (engagement / impressions) * 100 : null,
    postsPerWeek: Math.round((postCount / 30) * 7 * 10) / 10,
  };
}

/** Hitung benchmark score 0-100 untuk satu kompetitor */
function computeBenchmarkScore(
  comp: {
    followers: number;
    avgEngagementRateBp: number | null;
    postsPerWeek: number | null;
  },
  aggregate: CompetitorAggregate,
): number {
  // Relatif terhadap rata-rata kompetitor (bukan absolut) — mirip reference app.
  // followers score
  const followersRef = aggregate.avgFollowers > 0 ? aggregate.avgFollowers : 1;
  const followersScore = Math.min(comp.followers / followersRef, 2) * 50; // 0-100
  // engagement score (bp = basis point %)
  const engRef =
    aggregate.avgEngagementRateBp != null && aggregate.avgEngagementRateBp > 0
      ? aggregate.avgEngagementRateBp
      : 100; // default 1%
  const engBp = comp.avgEngagementRateBp ?? 0;
  const engScore = Math.min(engBp / engRef, 2) * 50;
  // konsistensi score
  const postRef =
    aggregate.avgPostsPerWeek != null && aggregate.avgPostsPerWeek > 0
      ? aggregate.avgPostsPerWeek
      : 3;
  const consistency = comp.postsPerWeek ?? 0;
  const consistencyScore = Math.min(consistency / postRef, 2) * 50;

  const score = followersScore * 0.4 + engScore * 0.4 + consistencyScore * 0.2;
  return Math.round(Math.min(score, 100));
}

/**
 * Get daftar kompetitor org + benchmark vs performa org sendiri.
 */
export async function getCompetitorBenchmark(organizationId: string) {
  const [orgPerf, competitors] = await Promise.all([
    getOrgPerformance(organizationId),
    db
      .select()
      .from(competitor)
      .where(eq(competitor.organizationId, organizationId))
      .orderBy(competitor.followers),
  ]);

  // Agregat kompetitor
  const count = competitors.length;
  const avgFollowers =
    count > 0 ? Math.round(competitors.reduce((s, c) => s + c.followers, 0) / count) : 0;
  const engRates = competitors
    .map((c) => c.avgEngagementRateBp)
    .filter((x): x is number => x != null);
  const avgEngagementRateBp =
    engRates.length > 0 ? Math.round(engRates.reduce((s, x) => s + x, 0) / engRates.length) : null;
  const postRates = competitors.map((c) => c.postsPerWeek).filter((x): x is number => x != null);
  const avgPostsPerWeek =
    postRates.length > 0
      ? Math.round((postRates.reduce((s, x) => s + x, 0) / postRates.length) * 10) / 10
      : null;

  const aggregate: CompetitorAggregate = {
    count,
    avgFollowers,
    avgEngagementRateBp,
    avgPostsPerWeek,
  };

  const rows: CompetitorRow[] = competitors.map((c) => ({
    id: c.id,
    platform: c.platform,
    username: c.username,
    displayName: c.displayName,
    avatarUrl: c.avatarUrl,
    followers: c.followers,
    avgEngagementRateBp: c.avgEngagementRateBp,
    postsPerWeek: c.postsPerWeek,
    isVerified: c.isVerified,
    notes: c.notes,
    engagementHistory: c.engagementHistory ?? [],
    updatedAt: c.updatedAt.toISOString(),
    benchmarkScore: computeBenchmarkScore(c, aggregate),
  }));

  // Insight benchmark — org vs rata-rata kompetitor
  const insight = generateInsight(orgPerf, aggregate);

  return {
    org: orgPerf,
    aggregate,
    competitors: rows,
    insight,
  };
}

/** Insight teks — bagaimana performa org dibanding rata-rata kompetitor */
function generateInsight(org: OrgPerformance, agg: CompetitorAggregate): string {
  if (agg.count === 0) {
    return "Tambahkan kompetitor untuk mulai membandingkan performa Anda.";
  }
  const parts: string[] = [];
  const followersRatio = agg.avgFollowers > 0 ? org.followers / agg.avgFollowers : 1;
  if (followersRatio >= 1) {
    parts.push(
      `Followers Anda ${Math.round(followersRatio * 100)}% dari rata-rata kompetitor di atas rata-rata — posisi kuat.`,
    );
  } else {
    parts.push(
      `Followers Anda ${Math.round(followersRatio * 100)}% dari rata-rata kompetitor — masih ada gap untuk dikejar.`,
    );
  }
  if (org.engagementRate != null && agg.avgEngagementRateBp != null) {
    const orgBp = Math.round(org.engagementRate * 100);
    if (orgBp >= agg.avgEngagementRateBp) {
      parts.push(
        "Engagement rate Anda sudah di atas rata-rata kompetitor — konten Anda lebih menarik.",
      );
    } else {
      parts.push(
        `Engagement rate Anda ${(orgBp / 100).toFixed(1)}% vs kompetitor rata-rata ${(agg.avgEngagementRateBp / 100).toFixed(1)}% — perkuat hook & CTA.`,
      );
    }
  }
  if (agg.avgPostsPerWeek != null) {
    if (org.postsPerWeek >= agg.avgPostsPerWeek) {
      parts.push("Konsistensi posting Anda setara atau lebih baik dari kompetitor.");
    } else {
      parts.push(
        `Kompetitor rata-rata posting ${agg.avgPostsPerWeek}x/minggu, Anda ${org.postsPerWeek}x — tingkatkan frekuensi.`,
      );
    }
  }
  return parts.join(" ");
}
