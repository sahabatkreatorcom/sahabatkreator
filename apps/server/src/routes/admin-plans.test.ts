// Kontrak POST /admin/plans — khususnya validasi key fitur.
//
// `plan.features` dulu menerima string apa pun (`z.array(z.string().max(100))`).
// Typo seperti `api_wirte` tersimpan ke DB lalu mengunci fitur itu untuk SEMUA
// tier tanpa gejala, karena `checkPlanFeature` mencocokkan `includes()` persis
// dan tidak ada log yang menandai key yang tidak pernah cocok.

import { FEATURE_KEYS } from "@sahabatkreator/db";
import { describe, expect, it } from "vitest";
import { planUpsertSchema } from "./admin-config";

const validPlan = {
  tier: "pro",
  name: "Pro",
  description: "Untuk kreator aktif",
  priceIdr: 49000,
  billingIntervalMonths: 1,
  maxSocialAccounts: 5,
  maxScheduledPostsPerMonth: 100,
  maxTeamMembers: 3,
  maxMediaStorageMb: 5000,
  aiCreditsPerMonth: 100,
  renderCreditsPerMonth: 500,
  features: ["scheduling", "api_access"],
  isActive: true,
  sortOrder: 2,
};

describe("planUpsertSchema — key fitur", () => {
  it("menerima key katalog", () => {
    expect(planUpsertSchema.parse(validPlan).features).toEqual(["scheduling", "api_access"]);
  });

  it("menolak key yang tidak dikenal (typo)", () => {
    const result = planUpsertSchema.safeParse({ ...validPlan, features: ["api_wirte"] });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(["features", 0]);
    expect(result.error.issues[0]?.message).toContain("Key fitur tidak dikenal");
  });

  it("menolak lebih banyak key daripada ukuran katalog", () => {
    const result = planUpsertSchema.safeParse({
      ...validPlan,
      features: Array.from({ length: FEATURE_KEYS.length + 1 }, () => "scheduling"),
    });

    expect(result.success).toBe(false);
  });
});
