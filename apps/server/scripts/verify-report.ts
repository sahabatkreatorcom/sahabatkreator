// E2E verifikasi Scheduled Reports — data laporan riil, CSV, due schedule.
// Jalankan: bun scripts/verify-report.ts (dari apps/server)
//
// Skenario:
// 1. Seed analytics + post published + post_analytics
// 2. getReportData — ringkasan, followers growth, top posts
// 3. buildReportCsv — format CSV benar
// 4. buildReportEmailHtml — berisi angka kunci
// 5. getDueReports — schedule weekly due hari ini (jam sudah lewat)
// 6. markReportSent — dedupe (tidak due lagi)
// 7. Cleanup

import { resolve } from "node:path";
import {
  buildReportCsv,
  buildReportEmailHtml,
  db,
  getDueReports,
  getReportData,
  markReportSent,
} from "@sahabatkreator/db";
import {
  accountAnalytics,
  organization,
  post,
  postAnalytics,
  postGroup,
  reportSchedule,
  socialAccount,
  user,
} from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  const [org] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .limit(1);
  const [adminUser] = await db.select({ id: user.id }).from(user).limit(1);
  if (!org || !adminUser) {
    console.error("FAIL — butuh organization + user di DB");
    process.exit(1);
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = iso(new Date(Date.now() - 10 * 86400000));
  const to = iso(new Date());

  // Seed: akun + analytics + post published + post_analytics
  const igId = generateId("social");
  await db.insert(socialAccount).values({
    id: igId,
    organizationId: org.id,
    platform: "instagram",
    platformAccountId: `verify-report-ig-${Date.now()}`,
    username: "verify_report_ig",
    isConnected: true,
  });
  const analyticsIds: string[] = [];
  for (const [offset, followers] of [
    [-10, 900],
    [-5, 950],
    [-1, 1000],
  ] as const) {
    const id = generateId("acct");
    analyticsIds.push(id);
    await db.insert(accountAnalytics).values({
      id,
      organizationId: org.id,
      socialAccountId: igId,
      platform: "instagram",
      date: iso(new Date(Date.now() + offset * 86400000)),
      followers,
      impressions: 4000,
      reach: 2500,
    });
  }
  const groupId = generateId("pg");
  await db.insert(postGroup).values({
    id: groupId,
    organizationId: org.id,
    content: "Post laporan verifikasi",
    scheduledAt: new Date(Date.now() - 4 * 86400000),
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
    content: "Post laporan verifikasi",
    publishedAt: new Date(Date.now() - 4 * 86400000),
  });
  const paId = generateId("pa");
  await db.insert(postAnalytics).values({
    id: paId,
    organizationId: org.id,
    postId,
    socialAccountId: igId,
    platform: "instagram",
    date: iso(new Date(Date.now() - 4 * 86400000)),
    likes: 100,
    comments: 25,
    shares: 15,
    saves: 10,
  });

  // --- getReportData ---
  const report = await getReportData(org.id, from, to);
  pass("nama org terisi", report.organizationName === org.name, report.organizationName);
  pass("postsPublished = 1", report.postsPublished === 1, `${report.postsPublished}`);
  pass("engagement = 150", report.totalEngagement === 150, `${report.totalEngagement}`);
  pass("impressions = 12000", report.totalImpressions === 12000, `${report.totalImpressions}`);
  pass("reach = 7500", report.totalReach === 7500, `${report.totalReach}`);
  pass(
    "followers 900 → 1000",
    report.accounts.length === 1 &&
      report.accounts[0]!.followersStart === 900 &&
      report.accounts[0]!.followersEnd === 1000,
    `${report.accounts[0]?.followersStart} → ${report.accounts[0]?.followersEnd}`,
  );
  pass(
    "top post engagement 150",
    report.topPosts.length === 1 && report.topPosts[0]!.engagement === 150,
    `top = ${report.topPosts[0]?.engagement}`,
  );

  // --- buildReportCsv ---
  const csv = buildReportCsv(report);
  pass(
    "CSV berisi ringkasan",
    csv.includes("Postingan tayang,1") &&
      csv.includes("Total engagement,150") &&
      csv.includes("Top postingan"),
    "CSV lengkap",
  );
  pass(
    "CSV followers growth +100",
    csv.includes("@verify_report_ig (instagram),900,1000,100"),
    "baris akun benar",
  );

  // --- buildReportEmailHtml ---
  const html = buildReportEmailHtml(report, "7 hari terakhir");
  pass(
    "HTML email berisi angka",
    html.includes("150") && html.includes("Laporan Performa") && html.includes(org.name),
    "HTML OK",
  );

  // --- getDueReports: schedule weekly hari ini, jam 0 (pasti sudah lewat) ---
  const wibNow = new Date(Date.now() + 7 * 3600_000);
  const todayWibDay = wibNow.getUTCDay();
  const scheduleId = generateId("rpt");
  await db.insert(reportSchedule).values({
    id: scheduleId,
    organizationId: org.id,
    email: "verify-report@example.com",
    frequency: "weekly",
    sendDay: todayWibDay,
    sendHour: 0,
    isActive: true,
  });

  const due = await getDueReports();
  const myDue = due.find((d) => d.scheduleId === scheduleId);
  pass(
    "schedule weekly due terdeteksi",
    Boolean(myDue),
    myDue ? `due (${myDue.periodLabel})` : "tidak due",
  );

  // markReportSent → tidak due lagi (dedupe)
  await markReportSent(scheduleId);
  const dueAfter = await getDueReports();
  pass(
    "dedupe setelah terkirim",
    !dueAfter.some((d) => d.scheduleId === scheduleId),
    "tidak due lagi",
  );

  // Schedule tidak aktif → tidak due
  await db
    .update(reportSchedule)
    .set({ isActive: false, lastSentAt: null })
    .where(eq(reportSchedule.id, scheduleId));
  const dueInactive = await getDueReports();
  pass(
    "schedule nonaktif tidak due",
    !dueInactive.some((d) => d.scheduleId === scheduleId),
    "skip nonaktif",
  );

  // --- Cleanup ---
  await db.delete(postAnalytics).where(eq(postAnalytics.id, paId));
  await db.delete(post).where(eq(post.id, postId));
  await db.delete(postGroup).where(eq(postGroup.id, groupId));
  await db.delete(accountAnalytics).where(inArray(accountAnalytics.id, analyticsIds));
  await db.delete(reportSchedule).where(eq(reportSchedule.id, scheduleId));
  await db.delete(socialAccount).where(eq(socialAccount.id, igId));
  pass("cleanup", true, "data test dihapus");

  console.log("\nSelesai.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
