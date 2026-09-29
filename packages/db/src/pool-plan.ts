// Pemilihan langganan efektif sebuah pool — logika MURNI, tanpa akses DB,
// supaya bisa diuji tanpa database (packages/db tidak punya test runner).
//
// Dipisah dari pool-quota.ts karena dua bug senyap lahir tepat di sini:
// 1. `tier` diambil dari subscription.tier, sementara limit diambil dari baris
//    plan (tier, interval = 1). Dua sumber berbeda yang bisa tidak sinkron.
// 2. Langganan TAHUNAN tetap memakai baris bulanan, jadi mengubah limit baris
//    tahunan tidak berpengaruh apa pun — dan gejalanya tidak terlihat.

export const PLAN_TIERS = ["free", "pro", "business", "enterprise"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

const TIER_RANK: Record<PlanTier, number> = { free: 0, pro: 1, business: 2, enterprise: 3 };

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

/** Baris subscription seperlunya — bentuknya dibuat longgar agar mudah diuji. */
export type PoolSubscriptionCandidate = {
  tier: string;
  status: string;
  currentPeriodEnd: Date | null;
  planId: string | null;
};

export type PickedPoolSubscription = { tier: PlanTier; planId: string | null };

/**
 * Pilih langganan terbaik di pool: tier tertinggi di antara langganan yang
 * benar-benar berlaku (status active & belum lewat currentPeriodEnd).
 *
 * `planId` ikut dikembalikan karena baris plan yang BENAR-BENAR DIBELI adalah
 * sumber limit yang tepat — bukan tebakan dari tier. Pada tier seri, langganan
 * yang punya planId dimenangkan supaya pilihannya deterministik.
 */
export function pickPoolSubscription(
  subscriptions: readonly PoolSubscriptionCandidate[],
  now: Date = new Date(),
): PickedPoolSubscription | null {
  let best: PickedPoolSubscription | null = null;

  for (const sub of subscriptions) {
    if (sub.status !== "active") continue;
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < now) continue;
    // Jaga-jaga nilai enum baru/asing: perlakukan sebagai tidak berlaku daripada
    // meng-crash perhitungan tier seluruh pool.
    if (!isPlanTier(sub.tier)) continue;

    const candidate: PickedPoolSubscription = { tier: sub.tier, planId: sub.planId };
    if (!best) {
      best = candidate;
      continue;
    }

    const rankDiff = TIER_RANK[candidate.tier] - TIER_RANK[best.tier];
    if (rankDiff > 0 || (rankDiff === 0 && !best.planId && candidate.planId)) {
      best = candidate;
    }
  }

  return best;
}
