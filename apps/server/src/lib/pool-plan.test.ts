// Perilaku pemilihan langganan pool (logika murni, tanpa DB).
//
// Fungsi ini menentukan tier DAN baris plan mana yang dipakai untuk limit
// seluruh organisasi dalam satu pool — salah pilih berarti kuota salah untuk
// semua org milik satu pemilik, dan tidak ada error yang terlihat.

import { type PoolSubscriptionCandidate, pickPoolSubscription } from "@sahabatkreator/db/pool-plan";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-09-29T00:00:00Z");
const FUTURE = new Date("2027-01-01T00:00:00Z");
const PAST = new Date("2026-01-01T00:00:00Z");

function sub(overrides: Partial<PoolSubscriptionCandidate>): PoolSubscriptionCandidate {
  return {
    tier: "pro",
    status: "active",
    currentPeriodEnd: FUTURE,
    planId: "plan_pro",
    ...overrides,
  };
}

describe("pickPoolSubscription", () => {
  it("null bila tidak ada langganan sama sekali", () => {
    expect(pickPoolSubscription([], NOW)).toBeNull();
  });

  it("mengabaikan langganan yang tidak aktif atau sudah lewat periodenya", () => {
    expect(pickPoolSubscription([sub({ status: "inactive" })], NOW)).toBeNull();
    expect(pickPoolSubscription([sub({ status: "canceled" })], NOW)).toBeNull();
    expect(pickPoolSubscription([sub({ currentPeriodEnd: PAST })], NOW)).toBeNull();
  });

  it("currentPeriodEnd null dianggap masih berlaku", () => {
    expect(pickPoolSubscription([sub({ currentPeriodEnd: null })], NOW)?.tier).toBe("pro");
  });

  it("memilih tier tertinggi, bukan langganan pertama", () => {
    const picked = pickPoolSubscription(
      [
        sub({ tier: "pro", planId: "plan_pro" }),
        sub({ tier: "business", planId: "plan_business" }),
      ],
      NOW,
    );
    expect(picked).toEqual({ tier: "business", planId: "plan_business" });
  });

  it("tier tertinggi yang sudah kedaluwarsa tidak menang", () => {
    const picked = pickPoolSubscription(
      [
        sub({ tier: "enterprise", planId: "plan_enterprise", currentPeriodEnd: PAST }),
        sub({ tier: "pro", planId: "plan_pro" }),
      ],
      NOW,
    );
    expect(picked).toEqual({ tier: "pro", planId: "plan_pro" });
  });

  it("membawa planId supaya limit dibaca dari baris yang benar-benar dibeli", () => {
    // Inilah yang membuat langganan tahunan memakai baris plan tahunan —
    // sebelumnya planId dibuang dan baris bulanan selalu dipakai.
    const picked = pickPoolSubscription([sub({ tier: "pro", planId: "plan_pro_yearly" })], NOW);
    expect(picked?.planId).toBe("plan_pro_yearly");
  });

  it("pada tier seri, memenangkan langganan yang punya planId", () => {
    const picked = pickPoolSubscription(
      [sub({ tier: "business", planId: null }), sub({ tier: "business", planId: "plan_business" })],
      NOW,
    );
    expect(picked).toEqual({ tier: "business", planId: "plan_business" });
  });

  it("tier di luar enum diabaikan, bukan merusak perhitungan pool", () => {
    const picked = pickPoolSubscription(
      [sub({ tier: "galaxy", planId: "plan_x" }), sub({ tier: "free", planId: "plan_free" })],
      NOW,
    );
    expect(picked).toEqual({ tier: "free", planId: "plan_free" });
  });
});
