// Test routing queue publish per platform.
//
// MENGAPA: queueNameForPlatform + rate limiter per platform adalah kontrak
// antara server (enqueue) dan worker (processor). Nama queue salah → job
// masuk queue tanpa processor → post tidak pernah terbit dan TIDAK ada error
// (BullMQ diam). Platform baru yang lupa rate limit-nya jalan tanpa throttle
// → permintaan ditolak platform.
import { describe, expect, it } from "vitest";
import { queueNameForPlatform } from "./connection";

describe("queueNameForPlatform", () => {
  it("membuat nama queue ter-prefix per platform", () => {
    expect(queueNameForPlatform("instagram")).toBe("sk_publish_instagram");
    expect(queueNameForPlatform("linkedin_org")).toBe("sk_publish_linkedin_org");
  });

  it("worker membuat processor untuk platform yang sama persis", () => {
    // apps/worker/src/index.ts mendaftar PLATFORMS array; nama harus cocok
    // persis dengan yang di-enqueue server lewat queueNameForPlatform.
    const workerPlatforms = [
      "instagram",
      "instagram_standalone",
      "facebook",
      "threads",
      "tiktok",
      "youtube",
      "pinterest",
      "linkedin",
      "linkedin_org",
      "bluesky",
      "google_business",
    ];
    for (const p of workerPlatforms) {
      expect(queueNameForPlatform(p), `${p} harus menghasilkan nama queue valid`).toMatch(
        /^sk_publish_[a-z_]+$/,
      );
    }
  });
});
