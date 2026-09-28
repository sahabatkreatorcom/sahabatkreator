// Goal Tracker — progres goal dihitung dari data analytics riil (bukan manual).
// Metric didukung:
//   followers        → snapshot followers terbaru dalam periode (max semua akun)
//   followers_growth → (followers terbaru - followers awal periode), max akun
//   engagement       → sum post_analytics (likes+comments+shares+saves) periode
//   impressions      → sum account_analytics.impressions periode
//   reach            → sum account_analytics.reach periode
//   posts_published  → count post published dalam periode

import { db } from "@sahabatkreator/db";
import {
  accountAnalytics,
  goal,
  post,
  postAnalytics,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export const GOAL_METRICS = [
  "followers",
  "followers_growth",
  "engagement",
  "impressions",
  "reach",
  "posts_published",
] as const;

export type GoalMetric = (typeof GOAL_METRICS)[number];

export const METRIC_LABELS: Record<GoalMetric, string> = {
  followers: "Total Followers",
  followers_growth: "Pertumbuhan Followers",
  engagement: "Total Engagement",
  impressions: "Total Impressions",
  reach: "Total Jangkauan",
  posts_published: "Postingan Tayang",
};

export type GoalProgress = {
  id: string;
  name: string;
  metric: string;
  metricLabel: string;
  targetValue: number;
  baselineValue: number;
  startDate: string;
  endDate: string;
  /** Nilai saat ini dari data riil */
  currentValue: number;
  /** Progress % relatif baseline→target (0-100+) */
  progressPercent: number;
  daysLeft: number;
  isCompleted: boolean;
};

function toISODate(d: Date | string): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
}

/** Hitung nilai metric org dari data analytics dalam periode */
export async function computeMetric(
  organizationId: string,
  metric: GoalMetric,
  startDate: string,
  endDate: string,
): Promise<number> {
  switch (metric) {
    case "followers":
    case "followers_growth": {
      // Snapshot followers per akun: awal periode & terbaru
      const rows = await db
        .select({
          socialAccountId: accountAnalytics.socialAccountId,
          date: accountAnalytics.date,
          followers: accountAnalytics.followers,
        })
        .from(accountAnalytics)
        .innerJoin(socialAccount, eq(accountAnalytics.socialAccountId, socialAccount.id))
        .where(
          and(
            eq(accountAnalytics.organizationId, organizationId),
            gte(accountAnalytics.date, startDate),
            lte(accountAnalytics.date, endDate),
          ),
        )
        .orderBy(accountAnalytics.date);

      if (rows.length === 0) return 0;

      const byAccount = new Map<string, { first: number; last: number }>();
      for (const row of rows) {
        const followers = row.followers ?? 0;
        const entry = byAccount.get(row.socialAccountId);
        if (!entry) {
          byAccount.set(row.socialAccountId, { first: followers, last: followers });
        } else {
          entry.last = followers;
        }
      }

      if (metric === "followers") {
        // Akun dengan followers terbanyak (ukuran akun utama org)
        return Math.max(...[...byAccount.values()].map((e) => e.last));
      }
      // Total pertumbuhan semua akun
      return [...byAccount.values()].reduce((sum, e) => sum + Math.max(0, e.last - e.first), 0);
    }

    case "engagement": {
      const [row] = await db
        .select({
          total: sql<number>`coalesce(sum(${postAnalytics.likes} + ${postAnalytics.comments} + ${postAnalytics.shares} + ${postAnalytics.saves}), 0)::int`,
        })
        .from(postAnalytics)
        .where(
          and(
            eq(postAnalytics.organizationId, organizationId),
            gte(postAnalytics.date, startDate),
            lte(postAnalytics.date, endDate),
          ),
        );
      return row?.total ?? 0;
    }

    case "impressions": {
      const [row] = await db
        .select({
          total: sql<number>`coalesce(sum(${accountAnalytics.impressions}), 0)::bigint`,
        })
        .from(accountAnalytics)
        .where(
          and(
            eq(accountAnalytics.organizationId, organizationId),
            gte(accountAnalytics.date, startDate),
            lte(accountAnalytics.date, endDate),
          ),
        );
      return Number(row?.total ?? 0);
    }

    case "reach": {
      const [row] = await db
        .select({
          total: sql<number>`coalesce(sum(${accountAnalytics.reach}), 0)::bigint`,
        })
        .from(accountAnalytics)
        .where(
          and(
            eq(accountAnalytics.organizationId, organizationId),
            gte(accountAnalytics.date, startDate),
            lte(accountAnalytics.date, endDate),
          ),
        );
      return Number(row?.total ?? 0);
    }

    case "posts_published": {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(post)
        .where(
          and(
            eq(post.organizationId, organizationId),
            eq(post.status, "published"),
            gte(post.publishedAt, new Date(`${startDate}T00:00:00+07:00`)),
            lte(post.publishedAt, new Date(`${endDate}T23:59:59+07:00`)),
          ),
        );
      return row?.count ?? 0;
    }
  }
}

/** Baseline awal goal: nilai metric saat ini (growth metrics mulai dari 0) */
export async function computeBaseline(organizationId: string, metric: GoalMetric): Promise<number> {
  if (metric === "followers") {
    // Snapshot followers terbaru semua waktu
    const rows = await db
      .select({ followers: accountAnalytics.followers })
      .from(accountAnalytics)
      .innerJoin(socialAccount, eq(accountAnalytics.socialAccountId, socialAccount.id))
      .where(eq(accountAnalytics.organizationId, organizationId))
      .orderBy(desc(accountAnalytics.date))
      .limit(20);
    return Math.max(0, ...rows.map((r) => r.followers ?? 0));
  }
  // Growth & aggregate metrics: baseline 0 (dihitung dari awal periode)
  return 0;
}

/** Ambil semua goal org + progres terhitung */
export async function getGoalsWithProgress(organizationId: string): Promise<GoalProgress[]> {
  const goals = await db
    .select()
    .from(goal)
    .where(eq(goal.organizationId, organizationId))
    .orderBy(desc(goal.createdAt));

  const today = toISODate(new Date());
  const results: GoalProgress[] = [];

  for (const g of goals) {
    const metric = g.metric as GoalMetric;
    const startDate = toISODate(g.startDate);
    const endDate = toISODate(g.endDate);
    const currentValue = await computeMetric(organizationId, metric, startDate, endDate);

    // Progress relatif baseline → target
    const span = Math.max(1, g.targetValue - g.baselineValue);
    const progressPercent = Math.max(
      0,
      Math.round(((currentValue - g.baselineValue) / span) * 100),
    );

    const daysLeft = Math.max(
      0,
      Math.ceil(
        (new Date(`${endDate}T23:59:59+07:00`).getTime() -
          new Date(`${today}T00:00:00+07:00`).getTime()) /
          86400000,
      ),
    );

    // Tandai selesai otomatis bila target tercapai
    const achieved = currentValue >= g.targetValue;
    if (achieved && !g.isCompleted) {
      await db
        .update(goal)
        .set({ isCompleted: true, completedAt: new Date() })
        .where(eq(goal.id, g.id));
    }

    results.push({
      id: g.id,
      name: g.name,
      metric: g.metric,
      metricLabel: METRIC_LABELS[metric] ?? g.metric,
      targetValue: g.targetValue,
      baselineValue: g.baselineValue,
      startDate,
      endDate,
      currentValue,
      progressPercent,
      daysLeft,
      isCompleted: achieved || g.isCompleted,
    });
  }

  return results;
}
