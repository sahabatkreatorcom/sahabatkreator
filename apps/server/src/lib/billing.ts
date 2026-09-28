// Plan limits & feature gate — billing Sumopod Pay (wrapper pool per-user).
// Logika pool ada di @sahabatkreator/db/pool-quota (dipakai juga worker & auth);
// file ini hanya membungkus jadi HTTPError 402/403 untuk konteks HTTP.

import {
  consumePoolRenderCredits,
  getPoolFeatures,
  getPoolLimits,
  getPoolLimitsForOrg,
  getPoolTier,
  getPoolUsage,
  type PlanLimits,
  type PlanTier,
  QuotaExceededError,
  resolvePoolOrgIds,
} from "@sahabatkreator/db";
import { HTTPError } from "./auth-guard";

export { DEFAULT_LIMITS } from "@sahabatkreator/db";
export type { PlanLimits, PlanTier };

/** Ambil tier langganan efektif pool (tier tertinggi, default free) */
export async function getOrgTier(organizationId: string): Promise<PlanTier> {
  return getPoolTier(await resolvePoolOrgIds(organizationId));
}

/** Ambil limit efektif pool (resolve pool dari org aktif) */
export async function getOrgLimits(organizationId: string): Promise<PlanLimits> {
  return getPoolLimitsForOrg(organizationId);
}

export type Feature = "social_accounts" | "scheduled_posts" | "team_members" | "media_storage";

/**
 * Cek limit feature vs usage pool (diagregasi seluruh org milik pemilik org
 * aktif). Throw HTTPError 402 bila melebihi limit plan.
 */
export async function checkFeatureGate(
  organizationId: string,
  feature: Feature,
): Promise<PlanLimits> {
  const orgIds = await resolvePoolOrgIds(organizationId);
  const limits = await getPoolLimitsForOrg(organizationId);
  const used = await getPoolUsage(orgIds, feature);

  switch (feature) {
    case "social_accounts":
      if (used >= limits.maxSocialAccounts) {
        throw new HTTPError(
          402,
          `Limit akun tercapai (${limits.maxSocialAccounts} untuk plan ${limits.tier}). Upgrade untuk menambah akun.`,
        );
      }
      break;
    case "scheduled_posts":
      if (used >= limits.maxScheduledPostsPerMonth) {
        throw new HTTPError(
          402,
          `Limit post bulanan tercapai (${limits.maxScheduledPostsPerMonth} untuk plan ${limits.tier}).`,
        );
      }
      break;
    case "team_members":
      if (used >= limits.maxTeamMembers) {
        throw new HTTPError(
          402,
          `Limit anggota tim tercapai (${limits.maxTeamMembers} untuk plan ${limits.tier}).`,
        );
      }
      break;
    case "media_storage":
      if (used >= limits.maxMediaStorageMb * 1024 * 1024) {
        throw new HTTPError(
          402,
          `Limit penyimpanan tercapai (${limits.maxMediaStorageMb} MB untuk plan ${limits.tier}).`,
        );
      }
      break;
  }

  return limits;
}

/** Bungkus QuotaExceededError (dari packages/db) jadi HTTPError 402. */
export function rethrowQuotaAsHttp(error: unknown): never {
  if (error instanceof QuotaExceededError) {
    throw new HTTPError(402, error.message);
  }
  throw error;
}

/**
 * Cek fitur per paket (bukan limit numerik): baca `features` plan tier
 * tertinggi pool. Throw HTTPError 402 bila key fitur tidak ada di paket.
 * Dipakai gate route (listening, competitors, automation, dsb).
 */
export async function checkPlanFeature(organizationId: string, feature: string): Promise<void> {
  const orgIds = await resolvePoolOrgIds(organizationId);
  const { tier, features } = await getPoolFeatures(orgIds);
  if (!features.includes(feature)) {
    throw new HTTPError(
      402,
      `Fitur ini tidak termasuk paket ${tier}. Upgrade paket untuk membukanya.`,
    );
  }
}

/** Biaya kredit render per aksi — konsumsi hanya saat enqueue (retry gratis). */
export const RENDER_CREDIT_COST = {
  video: 10,
  carousel: 5,
  autoClipAnalysis: 5,
  autoClipSegment: 5,
} as const;

/**
 * Cek limit kredit render pool lalu konsumsi (throw 402 bila habis).
 * Panggil SEBELUM insert job; retry job yang sudah pernah dibuat tidak
 * dikenai biaya lagi (charge hanya sekali di enqueue).
 */
export async function consumeRenderCredits(
  organizationId: string,
  action: keyof typeof RENDER_CREDIT_COST,
  opts: { userId: string; units?: number },
): Promise<void> {
  const orgIds = await resolvePoolOrgIds(organizationId);
  const limits = await getPoolLimits(orgIds);
  try {
    await consumePoolRenderCredits(organizationId, orgIds, limits.renderCreditsPerMonth, {
      action,
      credits: RENDER_CREDIT_COST[action] * (opts.units ?? 1),
      userId: opts.userId,
    });
  } catch (error) {
    rethrowQuotaAsHttp(error);
  }
}
