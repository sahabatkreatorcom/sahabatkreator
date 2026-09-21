// Plan limits & feature gate — billing Sumopod Pay

import { db } from "@sahabatkreator/db";
import { plan, subscription } from "@sahabatkreator/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { HTTPError } from "./auth-guard";

export type PlanTier = "free" | "pro" | "business" | "enterprise";

export type PlanLimits = {
  tier: PlanTier;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  aiCreditsPerMonth: number;
};

export const DEFAULT_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    tier: "free",
    maxSocialAccounts: 1,
    maxScheduledPostsPerMonth: 10,
    maxTeamMembers: 1,
    maxMediaStorageMb: 500,
    aiCreditsPerMonth: 0,
  },
  pro: {
    tier: "pro",
    maxSocialAccounts: 5,
    maxScheduledPostsPerMonth: 100,
    maxTeamMembers: 3,
    maxMediaStorageMb: 5000,
    aiCreditsPerMonth: 100,
  },
  business: {
    tier: "business",
    maxSocialAccounts: 20,
    maxScheduledPostsPerMonth: 500,
    maxTeamMembers: 10,
    maxMediaStorageMb: 25000,
    aiCreditsPerMonth: 500,
  },
  enterprise: {
    tier: "enterprise",
    maxSocialAccounts: 100,
    maxScheduledPostsPerMonth: 2000,
    maxTeamMembers: 50,
    maxMediaStorageMb: 100000,
    aiCreditsPerMonth: 2000,
  },
};

/** Ambil tier langganan aktif organization (default free) */
export async function getOrgTier(organizationId: string): Promise<PlanTier> {
  const [sub] = await db
    .select({
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.organizationId, organizationId))
    .limit(1);

  if (!sub) return "free";
  if (sub.status !== "active") return "free";
  // Periode berakhir tanpa perpanjangan → turun ke free
  if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) return "free";
  return sub.tier as PlanTier;
}

/** Ambil limit efektif organization (dari DB jika ada, fallback default) */
export async function getOrgLimits(organizationId: string): Promise<PlanLimits> {
  const tier = await getOrgTier(organizationId);
  const [row] = await db
    .select({
      maxSocialAccounts: plan.maxSocialAccounts,
      maxScheduledPostsPerMonth: plan.maxScheduledPostsPerMonth,
      maxTeamMembers: plan.maxTeamMembers,
      maxMediaStorageMb: plan.maxMediaStorageMb,
      aiCreditsPerMonth: plan.aiCreditsPerMonth,
    })
    .from(plan)
    .where(and(eq(plan.tier, tier), eq(plan.billingIntervalMonths, 1), eq(plan.isActive, true)))
    .limit(1);

  if (!row) return DEFAULT_LIMITS[tier];
  return { tier, ...row };
}

export type Feature = "social_accounts" | "scheduled_posts" | "team_members" | "media_storage";

/**
 * Cek limit feature vs usage saat ini. Throw HTTPError 402/403 jika melebihi.
 */
export async function checkFeatureGate(
  organizationId: string,
  feature: Feature,
): Promise<PlanLimits> {
  const limits = await getOrgLimits(organizationId);

  switch (feature) {
    case "social_accounts": {
      const { socialAccount } = await import("@sahabatkreator/db/schema");
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(socialAccount)
        .where(eq(socialAccount.organizationId, organizationId));
      if ((row?.total ?? 0) >= limits.maxSocialAccounts) {
        throw new HTTPError(
          402,
          `Limit akun tercapai (${limits.maxSocialAccounts} untuk plan ${limits.tier}). Upgrade untuk menambah akun.`,
        );
      }
      break;
    }
    case "scheduled_posts": {
      const { post } = await import("@sahabatkreator/db/schema");
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(post)
        .where(and(eq(post.organizationId, organizationId), gte(post.createdAt, startOfMonth)));
      if ((row?.total ?? 0) >= limits.maxScheduledPostsPerMonth) {
        throw new HTTPError(
          402,
          `Limit post bulanan tercapai (${limits.maxScheduledPostsPerMonth} untuk plan ${limits.tier}).`,
        );
      }
      break;
    }
    case "team_members": {
      const { member } = await import("@sahabatkreator/db/schema");
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(member)
        .where(eq(member.organizationId, organizationId));
      if ((row?.total ?? 0) >= limits.maxTeamMembers) {
        throw new HTTPError(
          402,
          `Limit anggota tim tercapai (${limits.maxTeamMembers} untuk plan ${limits.tier}).`,
        );
      }
      break;
    }
    case "media_storage": {
      const { media } = await import("@sahabatkreator/db/schema");
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(size_bytes), 0)::bigint` })
        .from(media)
        .where(eq(media.organizationId, organizationId));
      if (Number(row?.total ?? 0) >= limits.maxMediaStorageMb * 1024 * 1024) {
        throw new HTTPError(
          402,
          `Limit penyimpanan tercapai (${limits.maxMediaStorageMb} MB untuk plan ${limits.tier}).`,
        );
      }
      break;
    }
  }

  return limits;
}
