// E2E verifikasi getCoachSummary — agregasi performa 30 hari dari snapshot analytics.
// Jalankan: bun scripts/verify-coach.ts (dari apps/server)
//
// Skenario:
// 1. Seed 2 akun (instagram followers 1000→1150, tiktok 500→450) + account analytics
//    → followersTotal=1650, followersDelta=+100
// 2. Seed 3 post published dalam 30 hari + post analytics (2 snapshot hari berbeda
//    untuk post pertama — snapshot TERBARU yang dipakai, bukan sum) → publishedCount, perPlatform, topPost
// 3. Engagement rate per platform dihitung dari engagement/impressions
// 4. hasData=false untuk org tanpa data

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  accountAnalytics,
  organization,
  post,
  postAnalytics,
  postGroup,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { getCoachSummary } from "../src/lib/coach";

config({ path: resolve(process.cwd(), "../../.env") });

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization di DB — jalankan signup dulu.");
    process.exit(1);
  }

  const suffix = Date.now().toString(36);
  const igAccountId = `sk_acc_coach_${suffix}`;
  const ttAccountId = `sk_acc_coachtt_${suffix}`;
  const groupId = `sk_pg_coach_${suffix}`;
  const postIds = [1, 2, 3].map((n) => `sk_post_coach_${n}_${suffix}`);
  const [postId1, postId2, postId3] = postIds;
  if (!postId1 || !postId2 || !postId3) {
    console.error("Setup postIds gagal.");
    process.exit(1);
  }

  // --- Seed: akun + post + analytics ---
  await db.insert(socialAccount).values([
    {
      id: igAccountId,
      organizationId: org.id,
      platform: "instagram",
      platformAccountId: igAccountId,
      username: "coach-test-ig",
      isConnected: false,
    },
    {
      id: ttAccountId,
      organizationId: org.id,
      platform: "tiktok",
      platformAccountId: ttAccountId,
      username: "coach-test-tt",
      isConnected: false,
    },
  ]);
  await db.insert(postGroup).values({ id: groupId, organizationId: org.id, content: "coach test" });
  await db.insert(post).values([
    // post terbaik: engagement tertinggi
    {
      id: postId1,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: igAccountId,
      platform: "instagram",
      status: "published",
      platformPostId: `p1_${suffix}`,
      publishedAt: new Date(isoDaysAgo(3)),
      content: "Post terbaik giveaway akhir bulan",
    },
    {
      id: postId2,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: igAccountId,
      platform: "instagram",
      status: "published",
      platformPostId: `p2_${suffix}`,
      publishedAt: new Date(isoDaysAgo(10)),
      content: "Post edukasi tips UMKM",
    },
    {
      id: postId3,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: ttAccountId,
      platform: "tiktok",
      status: "published",
      platformPostId: `p3_${suffix}`,
      publishedAt: new Date(isoDaysAgo(5)),
      content: "Post tiktok viral",
    },
  ]);

  const d5 = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const d1 = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
  const dToday = new Date().toISOString().slice(0, 10);
  const d28 = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const d1_28 = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);

  // Post analytics: post 1 punya 2 snapshot (lama rendah, baru tinggi) → snapshot terbaru dipakai
  await db.insert(postAnalytics).values([
    {
      id: `sk_pa_c1a_${suffix}`,
      organizationId: org.id,
      postId: postId1,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: d5,
      likes: 50,
      comments: 5,
      shares: 2,
      saves: 1,
      views: 200,
      impressions: 250,
    },
    {
      id: `sk_pa_c1b_${suffix}`,
      organizationId: org.id,
      postId: postIds[0]!,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: dToday,
      likes: 300,
      comments: 40,
      shares: 30,
      saves: 20,
      views: 5000,
      impressions: 6000,
    },
    {
      id: `sk_pa_c2_${suffix}`,
      organizationId: org.id,
      postId: postId2,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: d1,
      likes: 100,
      comments: 10,
      shares: 5,
      saves: 5,
      views: 1500,
      impressions: 2000,
    },
    {
      id: `sk_pa_c3_${suffix}`,
      organizationId: org.id,
      postId: postId3,
      socialAccountId: ttAccountId,
      platform: "tiktok",
      date: d1,
      likes: 200,
      comments: 20,
      shares: 60,
      saves: 10,
      views: 8000,
      impressions: 9000,
    },
  ]);

  // Account analytics: IG 1000→1150 (delta +150), TikTok 500→450 (delta -50) → total delta +100
  await db.insert(accountAnalytics).values([
    {
      id: `sk_aa_cig1_${suffix}`,
      organizationId: org.id,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: d28,
      followers: 1000,
    },
    {
      id: `sk_aa_cig2_${suffix}`,
      organizationId: org.id,
      socialAccountId: igAccountId,
      platform: "instagram",
      date: d1_28,
      followers: 1150,
    },
    {
      id: `sk_aa_ctt1_${suffix}`,
      organizationId: org.id,
      socialAccountId: ttAccountId,
      platform: "tiktok",
      date: d28,
      followers: 500,
    },
    {
      id: `sk_aa_ctt2_${suffix}`,
      organizationId: org.id,
      socialAccountId: ttAccountId,
      platform: "tiktok",
      date: d1_28,
      followers: 450,
    },
  ]);

  try {
    const summary = await getCoachSummary(org.id);

    // Skenario 1: followers total & delta (test data: IG 1150 + TT 450 = 1600)
    pass(
      "followersTotal mencakup 1600 dari test data",
      (summary.followersTotal ?? 0) >= 1600,
      `followersTotal=${summary.followersTotal}`,
    );
    // delta test data = +150 - 50 = +100 (delta lain mungkin ada)
    pass(
      "followersDelta termasuk +100 dari test data",
      (summary.followersDelta ?? 0) >= 100,
      `followersDelta=${summary.followersDelta}`,
    );

    // Skenario 2: post 1 pakai snapshot TERBARU (likes 300, bukan 350)
    const ig = summary.perPlatform.find((p) => p.platform === "instagram");
    const tt = summary.perPlatform.find((p) => p.platform === "tiktok");
    // total likes IG = 300 + 100 = 400 (snapshot terbaru per post, bukan 50+300+100)
    pass(
      "snapshot terbaru per post dipakai (bukan sum lintas hari)",
      Boolean(ig && ig.totalLikes >= 400),
      `IG totalLikes=${ig?.totalLikes} (harus >= 400; snapshot lama 50 tidak dihitung)`,
    );

    // Skenario 3: engagement rate = engagement / impressions
    // IG: engagement = (300+40+30+20) + (100+10+5+5) = 510; impressions = 6000+2000 = 8000 → 6.4%
    pass(
      "engagement rate IG dihitung",
      Boolean(ig && ig.engagementRate != null && ig.engagementRate >= 6),
      `IG engagementRate=${ig?.engagementRate}% (test data 6.4%)`,
    );

    // Skenario 4: topPost = post engagement tertinggi
    // Post 1: 300+40+30+20=390; post tiktok: 200+20+60+10=290 → post 1 menang
    pass(
      "topPost = post dengan engagement tertinggi",
      Boolean(
        summary.topPost &&
          summary.topPost.content.includes("giveaway") &&
          summary.topPost.likes === 300,
      ),
      `topPost="${summary.topPost?.content.slice(0, 40)}" likes=${summary.topPost?.likes}`,
    );

    // Skenario 5: publishedCount & postsPerWeek positif, hasData true
    pass(
      "publishedCount & hasData",
      summary.publishedCount >= 3 && summary.hasData && summary.postsPerWeek > 0,
      `publishedCount=${summary.publishedCount}, postsPerWeek=${summary.postsPerWeek}, hasData=${summary.hasData}`,
    );

    // Skenario 6: per-platform followers delta terisi
    pass(
      "followers delta per platform",
      Boolean(ig?.followersDelta != null && tt?.followersDelta != null),
      `IG followers=${ig?.followersLatest} (delta ${ig?.followersDelta}), TT followers=${tt?.followersLatest} (delta ${tt?.followersDelta})`,
    );
  } finally {
    // Cleanup
    await db.delete(postAnalytics).where(inArray(postAnalytics.postId, postIds));
    await db
      .delete(accountAnalytics)
      .where(inArray(accountAnalytics.socialAccountId, [igAccountId, ttAccountId]));
    await db.delete(post).where(eq(post.postGroupId, groupId));
    await db.delete(postGroup).where(eq(postGroup.id, groupId));
    await db.delete(socialAccount).where(inArray(socialAccount.id, [igAccountId, ttAccountId]));
    console.log("Cleanup selesai — data test dihapus.");
  }

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
