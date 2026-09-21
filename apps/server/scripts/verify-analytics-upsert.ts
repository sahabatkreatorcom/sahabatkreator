// E2E verifikasi upsert analytics — snapshot harian dedupe (unique date).
// Jalankan: bun scripts/verify-analytics-upsert.ts (dari apps/server)
//
// Skenario:
// 1. Upsert account_analytics hari ini (followers 100) → row ada
// 2. Upsert ulang hari yang sama (followers 250) → row TER-UPDATE (bukan row baru)
// 3. Upsert post_analytics hari ini (likes 10) → row ada
// 4. Upsert ulang (likes 25) → row TER-UPDATE, tetap 1 row per (post, date)

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
import { upsertAccountAnalytics, upsertPostAnalytics } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Host: akun pertama atau buat sementara (org → postGroup → post → account)
  let [account] = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
    })
    .from(socialAccount)
    .limit(1);
  let tempIds: { accountId?: string; groupId?: string; postId?: string } = {};
  if (!account) {
    const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) {
      console.error("Tidak ada organization di DB — jalankan signup dulu.");
      process.exit(1);
    }
    const suffix = Date.now().toString(36);
    const accountId = `sk_acc_atest_${suffix}`;
    const groupId = `sk_pg_atest_${suffix}`;
    const postId = `sk_post_atest_${suffix}`;
    await db.insert(socialAccount).values({
      id: accountId,
      organizationId: org.id,
      platform: "manual",
      platformAccountId: accountId,
      username: "analytics-e2e-test",
      displayName: "Analytics E2E Test (dihapus otomatis)",
      isConnected: false,
    });
    await db
      .insert(postGroup)
      .values({ id: groupId, organizationId: org.id, content: "e2e analytics test" });
    await db.insert(post).values({
      id: postId,
      organizationId: org.id,
      postGroupId: groupId,
      socialAccountId: accountId,
      platform: "manual",
      status: "published",
      platformPostId: `pid_${suffix}`,
      publishedAt: new Date(),
    });
    tempIds = { accountId, groupId, postId };
    account = { id: accountId, organizationId: org.id, platform: "manual" };
  } else {
    // Pakai akun existing — buat post test transient saja
    const suffix = Date.now().toString(36);
    const groupId = `sk_pg_atest_${suffix}`;
    const postId = `sk_post_atest_${suffix}`;
    await db.insert(postGroup).values({
      id: groupId,
      organizationId: account.organizationId,
      content: "e2e analytics test",
    });
    await db.insert(post).values({
      id: postId,
      organizationId: account.organizationId,
      postGroupId: groupId,
      socialAccountId: account.id,
      platform: account.platform,
      status: "published",
      platformPostId: `pid_${suffix}`,
      publishedAt: new Date(),
    });
    tempIds = { groupId, postId };
  }
  if (!tempIds.postId || !tempIds.groupId) {
    console.error("Setup data test gagal — postId/groupId tidak tersedia.");
    process.exit(1);
  }
  const testPostId = tempIds.postId;

  // Skenario 1+2: account snapshot harian ter-update (bukan duplikat)
  await upsertAccountAnalytics(account, { followers: 100, posts: 5 });
  await upsertAccountAnalytics(account, { followers: 250, posts: 8 });
  const accRows = await db
    .select({
      id: accountAnalytics.id,
      followers: accountAnalytics.followers,
      posts: accountAnalytics.posts,
    })
    .from(accountAnalytics)
    .where(eq(accountAnalytics.socialAccountId, account.id));
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = accRows.filter((r) => r.id); // semua row milik akun ini
  pass(
    "account snapshot upsert",
    todayRows.length >= 1 &&
      accRows.some((r) => r.followers === 250 && r.posts === 8) &&
      !accRows.some((r) => r.followers === 100),
    `rows(tanggal=${today})=${accRows.length}, terakhir followers=${accRows.at(-1)?.followers ?? "?"} (harus 250, bukan 100)`,
  );

  // Hitung row tanggal hari ini pasti hanya 1
  const rowsToday = await db
    .select({ id: accountAnalytics.id, followers: accountAnalytics.followers })
    .from(accountAnalytics)
    .where(and(eq(accountAnalytics.socialAccountId, account.id), eq(accountAnalytics.date, today)));
  pass(
    "account snapshot 1 row/hari",
    rowsToday.length === 1 && rowsToday[0]?.followers === 250,
    `rows hari ini=${rowsToday.length}, followers=${rowsToday[0]?.followers ?? "?"} (harus 250)`,
  );

  // Skenario 3+4: post snapshot harian ter-update
  const postCtx = {
    id: testPostId,
    organizationId: account.organizationId,
    socialAccountId: account.id,
    platform: account.platform,
  };
  await upsertPostAnalytics(postCtx, { likes: 10, comments: 2, views: 100 });
  await upsertPostAnalytics(postCtx, { likes: 25, comments: 6, views: 400 });
  const postRows = await db
    .select({ id: postAnalytics.id, likes: postAnalytics.likes, views: postAnalytics.views })
    .from(postAnalytics)
    .where(and(eq(postAnalytics.postId, testPostId), eq(postAnalytics.date, today)));
  pass(
    "post snapshot upsert",
    postRows.length === 1 && postRows[0]?.likes === 25 && postRows[0]?.views === 400,
    `rows=${postRows.length}, likes=${postRows[0]?.likes ?? "?"} (harus 25), views=${postRows[0]?.views ?? "?"} (harus 400)`,
  );

  // Cleanup
  await db.delete(postAnalytics).where(eq(postAnalytics.postId, testPostId));
  await db.delete(post).where(eq(post.id, testPostId));
  await db.delete(postGroup).where(eq(postGroup.id, tempIds.groupId));
  if (tempIds.accountId) {
    await db
      .delete(accountAnalytics)
      .where(eq(accountAnalytics.socialAccountId, tempIds.accountId));
    await db.delete(socialAccount).where(eq(socialAccount.id, tempIds.accountId));
  } else {
    // Akun existing: hapus snapshot test hari ini saja jika sebelumnya tidak ada
    await db
      .delete(accountAnalytics)
      .where(
        and(eq(accountAnalytics.socialAccountId, account.id), eq(accountAnalytics.date, today)),
      );
  }
  console.log("Cleanup selesai — data test dihapus.");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
