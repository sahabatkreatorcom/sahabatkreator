// Pool quota per-user — limit plan diagregasi ke SELURUH org yang dimiliki
// (role='owner') satu user, bukan per-org aktif.
//
// Kontrak (keputusan desain):
// - Pool = org-org tempat ada member role='owner' untuk pemilik org aktif.
//   Fallback bila pemilik tak ditemukan: pool = [orgAktif] (perilaku lama).
// - Tier = langganan aktif dengan tier TERTINGGI di pool (free < pro < business < enterprise).
// - Semua pemakaian (akun sosial, post, anggota tim, media, kredit AI/render)
//   dihitung agregat lintas pool; konsumsi kredit tetap DICATAT di baris org
//   aktif (attribution per-org untuk audit), tapi cek limit pakai SUM pool.
// - team_members dihitung distinct userId (bukan jumlah baris) — satu orang
//   di 2 org pool tidak dihitung dua kali.
//
// Modul ini di packages/db karena dipakai apps/server (HTTPError), packages/publishing
// & packages/queue (worker, tanpa HTTP), dan packages/auth (hook invite).
// Throw error polos; caller server yang membungkus jadi HTTPError 402.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { generateId } from "./id";
import { db } from "./index";
import { aiUsage, aiUsageLog } from "./schema/ai";
import { plan, renderUsage, subscription } from "./schema/billing";
import { media, post } from "./schema/content";
import { member } from "./schema/organization";
import { socialAccount } from "./schema/social";

export type PlanTier = "free" | "pro" | "business" | "enterprise";

export type PlanLimits = {
  tier: PlanTier;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  aiCreditsPerMonth: number;
  renderCreditsPerMonth: number;
};

export const DEFAULT_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    tier: "free",
    maxSocialAccounts: 1,
    maxScheduledPostsPerMonth: 10,
    maxTeamMembers: 1,
    maxMediaStorageMb: 500,
    aiCreditsPerMonth: 0,
    renderCreditsPerMonth: 50,
  },
  pro: {
    tier: "pro",
    maxSocialAccounts: 5,
    maxScheduledPostsPerMonth: 100,
    maxTeamMembers: 3,
    maxMediaStorageMb: 5000,
    aiCreditsPerMonth: 100,
    renderCreditsPerMonth: 500,
  },
  business: {
    tier: "business",
    maxSocialAccounts: 20,
    maxScheduledPostsPerMonth: 500,
    maxTeamMembers: 10,
    maxMediaStorageMb: 25000,
    aiCreditsPerMonth: 500,
    renderCreditsPerMonth: 2500,
  },
  enterprise: {
    tier: "enterprise",
    maxSocialAccounts: 100,
    maxScheduledPostsPerMonth: 2000,
    maxTeamMembers: 50,
    maxMediaStorageMb: 100000,
    aiCreditsPerMonth: 2000,
    renderCreditsPerMonth: 10000,
  },
};

const TIER_RANK: Record<PlanTier, number> = { free: 0, pro: 1, business: 2, enterprise: 3 };

/** Periode bulan format "YYYY-MM" */
export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Resolve pool org IDs dari satu organizationId.
 * 1. Cari pemilik org aktif (member role='owner', terlama dulu — pembuat org).
 * 2. Kumpulkan semua org yang dimiliki user itu (role='owner').
 * 3. Fallback: [organizationId] bila pemilik tak ditemukan.
 */
export async function resolvePoolOrgIds(organizationId: string): Promise<string[]> {
  const [owner] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, "owner")))
    .orderBy(member.createdAt)
    .limit(1);

  if (!owner) return [organizationId];

  const owned = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, owner.userId), eq(member.role, "owner")));

  const ids = [...new Set(owned.map((r) => r.organizationId))];
  return ids.length ? ids : [organizationId];
}

/** Tier tertinggi dari langganan aktif di pool (default free). */
export async function getPoolTier(orgIds: string[]): Promise<PlanTier> {
  const subs = await db
    .select({
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .from(subscription)
    .where(inArray(subscription.organizationId, orgIds));

  let best: PlanTier = "free";
  for (const sub of subs) {
    if (sub.status !== "active") continue;
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) continue;
    const tier = sub.tier as PlanTier;
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}

/** Limit efektif pool: plan row tier tertinggi (interval bulanan, aktif) → fallback default. */
export async function getPoolLimits(orgIds: string[]): Promise<PlanLimits> {
  const tier = await getPoolTier(orgIds);
  const [row] = await db
    .select({
      maxSocialAccounts: plan.maxSocialAccounts,
      maxScheduledPostsPerMonth: plan.maxScheduledPostsPerMonth,
      maxTeamMembers: plan.maxTeamMembers,
      maxMediaStorageMb: plan.maxMediaStorageMb,
      aiCreditsPerMonth: plan.aiCreditsPerMonth,
      renderCreditsPerMonth: plan.renderCreditsPerMonth,
    })
    .from(plan)
    .where(and(eq(plan.tier, tier), eq(plan.billingIntervalMonths, 1), eq(plan.isActive, true)))
    .limit(1);

  if (!row) return DEFAULT_LIMITS[tier];
  return { tier, ...row };
}

/** Limit efektif pool untuk satu org aktif (resolve pool dulu). */
export async function getPoolLimitsForOrg(organizationId: string): Promise<PlanLimits> {
  return getPoolLimits(await resolvePoolOrgIds(organizationId));
}

/**
 * Fitur aktif pool: `features` (string[] key) dari plan tier tertinggi
 * (interval bulanan, aktif). Kosong bila plan row tidak ada — gate menolak.
 */
export async function getPoolFeatures(
  orgIds: string[],
): Promise<{ tier: PlanTier; features: string[] }> {
  const tier = await getPoolTier(orgIds);
  const [row] = await db
    .select({ features: plan.features })
    .from(plan)
    .where(and(eq(plan.tier, tier), eq(plan.billingIntervalMonths, 1), eq(plan.isActive, true)))
    .limit(1);
  return { tier, features: row?.features ?? [] };
}

export type PoolFeature = "social_accounts" | "scheduled_posts" | "team_members" | "media_storage";

/**
 * Pemakaian fitur saat ini, diagregasi lintas pool.
 * - social_accounts: jumlah akun
 * - scheduled_posts: jumlah post dibuat bulan ini (perilaku lama dipertahankan)
 * - team_members: distinct userId
 * - media_storage: total size_bytes (number, bisa > 2^53 hanya di skala ekstrem)
 */
export async function getPoolUsage(orgIds: string[], feature: PoolFeature): Promise<number> {
  switch (feature) {
    case "social_accounts": {
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(socialAccount)
        .where(inArray(socialAccount.organizationId, orgIds));
      return row?.total ?? 0;
    }
    case "scheduled_posts": {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(post)
        .where(and(inArray(post.organizationId, orgIds), gte(post.createdAt, startOfMonth)));
      return row?.total ?? 0;
    }
    case "team_members": {
      const [row] = await db
        .select({ total: sql<number>`count(distinct ${member.userId})::int` })
        .from(member)
        .where(inArray(member.organizationId, orgIds));
      return row?.total ?? 0;
    }
    case "media_storage": {
      const [row] = await db
        .select({ total: sql<number>`coalesce(sum(size_bytes), 0)::bigint` })
        .from(media)
        .where(inArray(media.organizationId, orgIds));
      return Number(row?.total ?? 0);
    }
  }
}

/** Pemakaian kredit AI pool bulan ini (SUM lintas org). */
export async function getPoolAiUsage(orgIds: string[]): Promise<{ used: number; period: string }> {
  const period = currentPeriod();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.creditsUsed}), 0)::int` })
    .from(aiUsage)
    .where(and(inArray(aiUsage.organizationId, orgIds), eq(aiUsage.period, period)));
  return { used: row?.total ?? 0, period };
}

/** Pemakaian kredit render pool bulan ini (SUM lintas org). */
export async function getPoolRenderUsage(
  orgIds: string[],
): Promise<{ used: number; period: string }> {
  const period = currentPeriod();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${renderUsage.creditsUsed}), 0)::int` })
    .from(renderUsage)
    .where(and(inArray(renderUsage.organizationId, orgIds), eq(renderUsage.period, period)));
  return { used: row?.total ?? 0, period };
}

/**
 * Error limit tercapai — dibungkus caller server jadi HTTPError 402.
 * (packages/db tidak boleh tahu konteks HTTP.)
 */
export class QuotaExceededError extends Error {
  readonly feature: PoolFeature | "ai_credits" | "render_credits";
  constructor(message: string, feature: QuotaExceededError["feature"]) {
    super(message);
    this.name = "QuotaExceededError";
    this.feature = feature;
  }
}

export type CreditConsumeOpts = {
  userId?: string;
  action: string;
  platform?: string;
  model?: string;
  credits?: number;
};

/**
 * Cek limit kredit AI pool lalu konsumsi (increment di baris org AKTIF,
 * cek pakai SUM pool). Throw QuotaExceededError bila melebihi limit.
 * `limit` dipassing caller (sudah berupa limit pool dari getPoolLimits*).
 */
export async function consumePoolAiCredits(
  organizationId: string,
  orgIds: string[],
  limit: number,
  opts: CreditConsumeOpts,
): Promise<{ used: number; limit: number }> {
  const credits = opts.credits ?? 1;
  const { used } = await getPoolAiUsage(orgIds);
  if (used + credits > limit) {
    throw new QuotaExceededError(
      `Kredit AI habis (${limit}/bulan untuk plan Anda). Upgrade untuk kredit tambahan.`,
      "ai_credits",
    );
  }

  await upsertCreditRow(aiUsage, organizationId, credits);
  await db.insert(aiUsageLog).values({
    id: generateId("ail"),
    organizationId,
    userId: opts.userId ?? null,
    action: opts.action,
    platform: opts.platform ?? null,
    model: opts.model ?? null,
    credits,
  });

  return { used: used + credits, limit };
}

/**
 * Cek limit kredit render pool lalu konsumsi. Tanpa refund job gagal;
 * retry job yang sudah pernah dibuat tidak dikenai biaya lagi.
 */
export async function consumePoolRenderCredits(
  organizationId: string,
  orgIds: string[],
  limit: number,
  opts: CreditConsumeOpts,
): Promise<{ used: number; limit: number }> {
  const credits = opts.credits ?? 1;
  const { used } = await getPoolRenderUsage(orgIds);
  if (used + credits > limit) {
    throw new QuotaExceededError(
      `Kredit render habis (${limit}/bulan untuk plan Anda). Upgrade atau tunggu periode berikutnya.`,
      "render_credits",
    );
  }

  await upsertCreditRow(renderUsage, organizationId, credits);
  return { used: used + credits, limit };
}

/** Upsert increment baris kredit per (org, period) — dipakai ai_usage & render_usage. */
async function upsertCreditRow(
  table: typeof aiUsage | typeof renderUsage,
  organizationId: string,
  credits: number,
): Promise<void> {
  await db
    .insert(table)
    .values({
      id: generateId(table === aiUsage ? "aiu" : "rndu"),
      organizationId,
      period: currentPeriod(),
      creditsUsed: credits,
    })
    .onConflictDoUpdate({
      target: [table.organizationId, table.period],
      set: { creditsUsed: sql`${table.creditsUsed} + ${credits}` },
    });
}
