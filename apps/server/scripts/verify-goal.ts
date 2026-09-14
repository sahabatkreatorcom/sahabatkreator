// E2E verifikasi Goal Tracker — computeMetric dari data analytics riil.
// Jalankan: bun scripts/verify-goal.ts (dari apps/server)
//
// Skenario:
// 1. Seed akun + account_analytics (followers naik) + post_analytics + post published
// 2. computeMetric followers_growth / engagement / posts_published / followers
// 3. getGoalsWithProgress — progress %, auto-complete saat target tercapai
// 4. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  accountAnalytics,
  organization,
  post,
  postAnalytics,
  postGroup,
  socialAccount,
  user,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { computeBaseline, computeMetric, getGoalsWithProgress } from "../src/lib/goal";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  const [adminUser] = await db.select({ id: user.id }).from(user).limit(1);
  if (!org || !adminUser) {
    console.error("FAIL — butuh organization + user di DB");
    process.exit(1);
  }

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startDate = iso(new Date(today.getTime() - 10 * 86400000));
  const endDate = iso(new Date(today.getTime() + 20 * 86400000));

  // Seed akun IG
  const igId = generateId("social");
  await db.insert(socialAccount).values({
    id: igId,
    organizationId: org.id,
    platform: "instagram",
    platformAccountId: `verify-goal-ig-${Date.now()}`,
    username: "verify_goal_ig",
    isConnected: true,
  });

  // account_analytics: followers 1000 → 1300 dalam periode
  const analyticsIds: string[] = [];
  for (const [dayOffset, followers] of [
    [-10, 1000],
    [-5, 1150],
    [-1, 1300],
  ] as const) {
    const id = generateId("acct");
    analyticsIds.push(id);
    await db.insert(accountAnalytics).values({
      id,
      organizationId: org.id,
      socialAccountId: igId,
      platform: "instagram",
      date: iso(new Date(today.getTime() + dayOffset * 86400000)),
      followers,
      impressions: 5000,
      reach: 3000,
    });
  }

  // post published + post_analytics (engagement)
  const groupId = generateId("pg");
  await db.insert(postGroup).values({
    id: groupId,
    organizationId: org.id,
    content: "Post verify goal",
    scheduledAt: new Date(today.getTime() - 3 * 86400000),
    createdByUserId: adminUser.id,
  });
  const postId = generateId("post");
  await db.insert(post).values({
    id: postId,
    organizationId: org.id,
    postGroupId: groupId,
    socialAccountId: igId,
    platform: "instagram",
    status: "published",
    content: "Post verify goal",
    publishedAt: new Date(today.getTime() - 3 * 86400000),
  });
  const paId = generateId("pa");
  await db.insert(postAnalytics).values({
    id: paId,
    organizationId: org.id,
    postId,
    socialAccountId: igId,
    platform: "instagram",
    date: iso(new Date(today.getTime() - 3 * 86400000)),
    likes: 120,
    comments: 30,
    shares: 20,
    saves: 10,
  });

  // --- computeMetric ---
  const growth = await computeMetric(org.id, "followers_growth", startDate, endDate);
  pass("followers_growth = 300 (1300-1000)", growth === 300, `growth = ${growth}`);

  const followers = await computeMetric(org.id, "followers", startDate, endDate);
  pass("followers terbaru = 1300", followers === 1300, `followers = ${followers}`);

  const engagement = await computeMetric(org.id, "engagement", startDate, endDate);
  pass("engagement = 180 (120+30+20+10)", engagement === 180, `engagement = ${engagement}`);

  const impressions = await computeMetric(org.id, "impressions", startDate, endDate);
  pass("impressions = 15000 (3×5000)", impressions === 15000, `impressions = ${impressions}`);

  const published = await computeMetric(org.id, "posts_published", startDate, endDate);
  pass("posts_published = 1", published === 1, `published = ${published}`);

  const baseline = await computeBaseline(org.id, "followers");
  pass("baseline followers = 1300 (terbaru)", baseline === 1300, `baseline = ${baseline}`);

  // --- getGoalsWithProgress: goal growth target 300 → harus 100% & auto-complete ---
  const goalId1 = generateId("goal");
  await db.execute(
    (await import("drizzle-orm"))
      .sql`insert into goal (id, organization_id, name, metric, target_value, baseline_value, start_date, end_date, is_completed, created_at)
      values (${goalId1}, ${org.id}, 'Verify growth goal', 'followers_growth', 300, 0, ${startDate}, ${endDate}, false, now())`,
  );
  // Goal engagement target 1000 → 18% (180/1000)
  const goalId2 = generateId("goal");
  await db.execute(
    (await import("drizzle-orm"))
      .sql`insert into goal (id, organization_id, name, metric, target_value, baseline_value, start_date, end_date, is_completed, created_at)
      values (${goalId2}, ${org.id}, 'Verify engagement goal', 'engagement', 1000, 0, ${startDate}, ${endDate}, false, now())`,
  );

  const progress = await getGoalsWithProgress(org.id);
  const g1 = progress.find((g) => g.id === goalId1);
  const g2 = progress.find((g) => g.id === goalId2);

  pass(
    "goal tercapai → 100% + isCompleted",
    g1?.progressPercent === 100 && g1?.isCompleted === true && g1?.currentValue === 300,
    `${g1?.progressPercent}% completed=${g1?.isCompleted}`,
  );
  pass(
    "goal berjalan → 18% (180/1000)",
    g2?.progressPercent === 18 && g2?.isCompleted === false,
    `${g2?.progressPercent}% completed=${g2?.isCompleted}`,
  );
  pass(
    "daysLeft dalam rentang 19-21",
    (g1?.daysLeft ?? 0) >= 19 && (g1?.daysLeft ?? 0) <= 21,
    `daysLeft = ${g1?.daysLeft}`,
  );

  // --- Cleanup ---
  await db.delete(postAnalytics).where(eq(postAnalytics.id, paId));
  await db.delete(post).where(eq(post.id, postId));
  await db.delete(postGroup).where(eq(postGroup.id, groupId));
  await db.delete(accountAnalytics).where(inArray(accountAnalytics.id, analyticsIds));
  await db.delete(socialAccount).where(eq(socialAccount.id, igId));
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`delete from goal where id in (${goalId1}, ${goalId2})`);
  pass("cleanup", true, "data test dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
