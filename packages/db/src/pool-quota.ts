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
import { type PlanTier, pickPoolSubscription } from "./pool-plan";
import { aiUsage, aiUsageLog } from "./schema/ai";
import { plan, renderUsage, subscription } from "./schema/billing";
import { media, post } from "./schema/content";
import { member } from "./schema/organization";
import { socialAccount } from "./schema/social";

export type { PlanTier };

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

/** Kolom baris plan yang dipakai limit & fitur — satu bentuk, satu sumber. */
const PLAN_ROW_COLUMNS = {
  tier: plan.tier,
  maxSocialAccounts: plan.maxSocialAccounts,
  maxScheduledPostsPerMonth: plan.maxScheduledPostsPerMonth,
  maxTeamMembers: plan.maxTeamMembers,
  maxMediaStorageMb: plan.maxMediaStorageMb,
  aiCreditsPerMonth: plan.aiCreditsPerMonth,
  renderCreditsPerMonth: plan.renderCreditsPerMonth,
  features: plan.features,
};

type PoolPlanRow = {
  tier: PlanTier;
  maxSocialAccounts: number;
  maxScheduledPostsPerMonth: number;
  maxTeamMembers: number;
  maxMediaStorageMb: number;
  aiCreditsPerMonth: number;
  renderCreditsPerMonth: number;
  features: string[];
};

async function loadPoolSubscriptions(orgIds: string[]) {
  return db
    .select({
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      planId: subscription.planId,
    })
    .from(subscription)
    .where(inArray(subscription.organizationId, orgIds));
}

/** Tier tertinggi dari langganan aktif di pool (default free). */
export async function getPoolTier(orgIds: string[]): Promise<PlanTier> {
  const best = pickPoolSubscription(await loadPoolSubscriptions(orgIds));
  return best?.tier ?? "free";
}

/**
 * Baris plan efektif pool — SATU-SATUNYA sumber limit DAN features, supaya
 * keduanya tidak mungkin berasal dari baris yang berbeda.
 *
 * Urutan resolusi:
 * 1. Baris yang benar-benar dibeli (`subscription.planId`) — interval apa pun.
 *    Ini yang membuat langganan TAHUNAN memakai baris tahunan; dulu selalu baris
 *    bulanan, jadi mengubah limit baris tahunan tidak berpengaruh sama sekali.
 * 2. Baris aktif untuk tier (bulanan sebelum tahunan).
 * 3. Baris non-aktif untuk tier — menonaktifkan plan tidak boleh diam-diam
 *    mengembalikan limit ke konstanta kode selama pelanggan lama masih ada.
 * 4. Tidak ada baris sama sekali → null; caller pakai DEFAULT_LIMITS + warning.
 */
async function resolvePoolPlan(
  orgIds: string[],
): Promise<{ tier: PlanTier; row: PoolPlanRow | null }> {
  const best = pickPoolSubscription(await loadPoolSubscriptions(orgIds));
  const tier = best?.tier ?? "free";

  // Guard `row.tier === tier`: planId bisa basi (mis. admin mengubah tier baris
  // plan setelah pelanggan membeli). Tanpa guard ini, planId basi bisa memberi
  // limit lebih tinggi daripada tier langganannya.
  if (best?.planId) {
    const [row] = await db
      .select(PLAN_ROW_COLUMNS)
      .from(plan)
      .where(eq(plan.id, best.planId))
      .limit(1);
    if (row && row.tier === tier) return { tier, row };
  }

  const [activeRow] = await db
    .select(PLAN_ROW_COLUMNS)
    .from(plan)
    .where(and(eq(plan.tier, tier), eq(plan.isActive, true)))
    // ASC: interval 1 (bulanan) menang atas 12 (tahunan) → deterministik.
    .orderBy(plan.billingIntervalMonths)
    .limit(1);
  if (activeRow) return { tier, row: activeRow };

  const [inactiveRow] = await db
    .select(PLAN_ROW_COLUMNS)
    .from(plan)
    .where(eq(plan.tier, tier))
    .orderBy(plan.billingIntervalMonths)
    .limit(1);
  if (inactiveRow) {
    console.warn(
      `[pool-quota] tier "${tier}" tidak punya baris plan aktif — memakai baris non-aktif agar pelanggan lama tidak kehilangan limit`,
    );
    return { tier, row: inactiveRow };
  }

  console.warn(
    `[pool-quota] tidak ada baris plan untuk tier "${tier}" — memakai DEFAULT_LIMITS kode`,
  );
  return { tier, row: null };
}

/** Limit efektif pool dari baris plan yang diresolusi (fallback: konstanta kode). */
export async function getPoolLimits(orgIds: string[]): Promise<PlanLimits> {
  const { tier, row } = await resolvePoolPlan(orgIds);
  if (!row) return DEFAULT_LIMITS[tier];
  return {
    tier,
    maxSocialAccounts: row.maxSocialAccounts,
    maxScheduledPostsPerMonth: row.maxScheduledPostsPerMonth,
    maxTeamMembers: row.maxTeamMembers,
    maxMediaStorageMb: row.maxMediaStorageMb,
    aiCreditsPerMonth: row.aiCreditsPerMonth,
    renderCreditsPerMonth: row.renderCreditsPerMonth,
  };
}

/** Limit efektif pool untuk satu org aktif (resolve pool dulu). */
export async function getPoolLimitsForOrg(organizationId: string): Promise<PlanLimits> {
  return getPoolLimits(await resolvePoolOrgIds(organizationId));
}

/**
 * Fitur aktif pool — dari baris plan yang SAMA dengan limit (lihat
 * resolvePoolPlan). Kosong hanya bila tidak ada baris plan sama sekali.
 */
export async function getPoolFeatures(
  orgIds: string[],
): Promise<{ tier: PlanTier; features: string[] }> {
  const { tier, row } = await resolvePoolPlan(orgIds);
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
