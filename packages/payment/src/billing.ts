/**
 * Billing Module
 *
 * Provides billing-related utilities for the platform:
 * - Plan configuration
 * - Feature gating
 * - Usage tracking
 * - Subscription management
 */

import { db, schema } from "@sahabat-kreator/db";
import { eq, and, sql } from "drizzle-orm";
import type { GatedFeature, PlanLimits, GateResult, OrganizationBillingInfo } from "./types";

// ─── Plan Configuration ───────────────────────────────────────────────────────

const PLAN_LIMITS: Record<string, PlanLimits | undefined> = {
  FREE: {
    socialAccounts: 3,
    teamMembers: 2,
    scheduledPostsPerMonth: 30,
    aiGenerationsPerMonth: 10,
    competitorTracking: 0,
    analyticsExport: false,
    customBranding: false,
    prioritySupport: false,
  },
  PRO: {
    socialAccounts: 10,
    teamMembers: 5,
    scheduledPostsPerMonth: 150,
    aiGenerationsPerMonth: 100,
    competitorTracking: 3,
    analyticsExport: true,
    customBranding: false,
    prioritySupport: false,
  },
  BUSINESS: {
    socialAccounts: 25,
    teamMembers: 15,
    scheduledPostsPerMonth: 500,
    aiGenerationsPerMonth: 500,
    competitorTracking: 10,
    analyticsExport: true,
    customBranding: true,
    prioritySupport: false,
  },
  ENTERPRISE: {
    socialAccounts: Infinity,
    teamMembers: Infinity,
    scheduledPostsPerMonth: Infinity,
    aiGenerationsPerMonth: Infinity,
    competitorTracking: Infinity,
    analyticsExport: true,
    customBranding: true,
    prioritySupport: true,
  },
  ADMIN: {
    socialAccounts: Infinity,
    teamMembers: Infinity,
    scheduledPostsPerMonth: Infinity,
    aiGenerationsPerMonth: Infinity,
    competitorTracking: Infinity,
    analyticsExport: true,
    customBranding: true,
    prioritySupport: true,
  },
};

export const PLAN_DISPLAY: Record<string, { name: string; description: string; color: string }> = {
  FREE: { name: "Free", description: "Get started with the basics", color: "#6B7280" },
  PRO: { name: "Pro", description: "For growing brands", color: "#8B5CF6" },
  BUSINESS: { name: "Business", description: "For teams & agencies", color: "#D4A574" },
  ENTERPRISE: { name: "Enterprise", description: "Unlimited everything", color: "#F59E0B" },
  ADMIN: { name: "Admin", description: "Internal — unlimited", color: "#EF4444" },
};

/** Harga bulanan per plan (IDR). 0 = gratis, null = custom (hubungi sales). */
export const PLAN_PRICES: Record<string, number | null> = {
  FREE: 0,
  PRO: 99_000,
  BUSINESS: 249_000,
  ENTERPRISE: null,
  ADMIN: null,
};

// ─── Plan Limits ───────────────────────────────────────────────────────────────

export function getPlanLimits(tier: string): PlanLimits {
  const limits = PLAN_LIMITS[tier] ?? PLAN_LIMITS.FREE;
  return limits as PlanLimits;
}

export function isFeatureEnabled(tier: string, feature: GatedFeature): boolean {
  const limits = getPlanLimits(tier);
  const value = limits[feature];
  if (typeof value === "boolean") return value;
  return (value as number) > 0;
}

export function getFeatureLimit(tier: string, feature: GatedFeature): number {
  const limits = getPlanLimits(tier);
  const value = limits[feature];
  if (typeof value === "number") return value;
  return value ? 1 : 0;
}

// ─── Feature Gate ──────────────────────────────────────────────────────────────

export async function checkFeatureGate(
  organizationId: string,
  feature: GatedFeature
): Promise<GateResult> {
  const org = await db.query.organization.findFirst({
    where: (t, { eq }) => eq(t.id, organizationId),
    columns: { tier: true },
  });

  if (!org) {
    return { allowed: false, reason: "Organization not found" };
  }

  const tier = org.tier;

  // ADMIN and ENTERPRISE bypass all gates
  if (tier === "ADMIN" || tier === "ENTERPRISE") {
    return { allowed: true };
  }

  const limits = getPlanLimits(tier);

  // Boolean features
  const booleanFeatures: GatedFeature[] = [
    "analyticsExport",
    "customBranding",
    "prioritySupport",
  ];

  if (booleanFeatures.includes(feature)) {
    const enabled = limits[feature] as boolean;
    return enabled
      ? { allowed: true }
      : { allowed: false, reason: `${feature} is not available on the ${tier} plan` };
  }

  // Numerical features
  const limit = limits[feature] as number;
  const current = await getUsageCount(organizationId, feature);

  if (current >= limit) {
    return {
      allowed: false,
      reason: `You've reached the ${tier} plan limit for ${feature}`,
      limit,
      current,
    };
  }

  return { allowed: true, limit, current };
}

// ─── Usage Count ───────────────────────────────────────────────────────────────

async function getUsageCount(organizationId: string, feature: GatedFeature): Promise<number> {
  switch (feature) {
    case "socialAccounts": {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.socialAccount)
        .where(and(eq(schema.socialAccount.organizationId, organizationId), eq(schema.socialAccount.isActive, true)));
      return result?.count ?? 0;
    }

    case "teamMembers": {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.member)
        .where(eq(schema.member.organizationId, organizationId));
      return result?.count ?? 0;
    }

    case "scheduledPostsPerMonth": {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.post)
        .where(and(
          eq(schema.post.organizationId, organizationId),
          eq(schema.post.status, "SCHEDULED"),
          sql`${schema.post.createdAt} >= ${startOfMonth}`
        ));
      return result?.count ?? 0;
    }

    case "aiGenerationsPerMonth": {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.post)
        .where(and(
          eq(schema.post.organizationId, organizationId),
          eq(schema.post.isAiGenerated, true),
          sql`${schema.post.createdAt} >= ${startOfMonth}`
        ));
      return result?.count ?? 0;
    }

    case "competitorTracking": {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.competitor)
        .where(eq(schema.competitor.organizationId, organizationId));
      return result?.count ?? 0;
    }

    default:
      return 0;
  }
}

// ─── Subscription Helpers ─────────────────────────────────────────────────────

export async function getOrganizationBillingInfo(
  organizationId: string
): Promise<OrganizationBillingInfo | null> {
  const org = await db.query.organization.findFirst({
    where: (t, { eq }) => eq(t.id, organizationId),
    columns: {
      tier: true,
      subscriptionStatus: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
    },
  });

  if (!org) return null;

  const settings = await db.query.globalIntegrationSettings.findFirst({
    where: (t, { eq }) => eq(t.id, "global_integration_settings"),
    columns: { sumopodTrialDays: true },
  });

  return {
    tier: org.tier,
    subscriptionStatus: org.subscriptionStatus || undefined,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    currentPeriodEnd: org.currentPeriodEnd || undefined,
    trialDays: settings?.sumopodTrialDays ?? 0,
  };
}
