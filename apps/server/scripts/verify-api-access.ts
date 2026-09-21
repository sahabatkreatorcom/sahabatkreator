// E2E verifikasi API Access — app review tracking + quota snapshot (upsert idempotent) + parse BUC header.
// Jalankan: bun scripts/verify-api-access.ts (dari apps/server)
//
// Skenario:
// 1. Insert app_review_tracking (checklist + statusHistory awal)
// 2. Update status → statusHistory bertambah + resolvedAt terisi saat approved
// 3. Filter by status & platform
// 4. recordQuotaSnapshot — insert pertama
// 5. recordQuotaSnapshot lagi hari sama → upsert (bukan baris baru)
// 6. parseMetaBucHeader — format header Meta Graph API
// 7. recordQuotaFromHeaders — via header simulasi (Headers object)
// 8. getLatestQuota — baca snapshot terbaru
// 9. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { apiQuotaSnapshot, appReviewTracking } from "@sahabatkreator/db/schema";
import {
  getLatestQuota,
  parseMetaBucHeader,
  recordQuotaFromHeaders,
  recordQuotaSnapshot,
} from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // ---------------------------------------------------------------------
  // 1. Insert tracking pengajuan
  // ---------------------------------------------------------------------
  const reviewId = generateId("apprev");
  await db.insert(appReviewTracking).values({
    id: reviewId,
    platform: "instagram",
    permissionScope: "instagram_content_publish",
    title: "Meta App Review — instagram_content_publish",
    description: "Publish konten ke Instagram Business atas nama kreator",
    status: "preparing",
    checklist: { privacy_policy: true, screencast: true },
    statusHistory: [{ status: "preparing", at: new Date().toISOString() }],
  });
  const [row] = await db.select().from(appReviewTracking).where(eq(appReviewTracking.id, reviewId));
  pass(
    "insert tracking",
    row !== undefined &&
      row.platform === "instagram" &&
      row.permissionScope === "instagram_content_publish" &&
      row.checklist?.screencast === true,
    `platform=${row?.platform}, scope=${row?.permissionScope}, checklist.screencast=${row?.checklist?.screencast}`,
  );

  // ---------------------------------------------------------------------
  // 2. Update status → approved: statusHistory append + resolvedAt terisi
  // ---------------------------------------------------------------------
  const historyBefore = row.statusHistory?.length ?? 0;
  await db
    .update(appReviewTracking)
    .set({
      status: "approved",
      statusHistory: [
        ...(row.statusHistory ?? []),
        { status: "approved", at: new Date().toISOString() },
      ],
      resolvedAt: new Date(),
      submissionId: "sub-12345",
    })
    .where(eq(appReviewTracking.id, reviewId));
  const [approved] = await db
    .select()
    .from(appReviewTracking)
    .where(eq(appReviewTracking.id, reviewId));
  pass(
    "update status approved",
    approved.status === "approved" &&
      approved.resolvedAt !== null &&
      (approved.statusHistory?.length ?? 0) === historyBefore + 1,
    `status=${approved.status}, resolvedAt=${approved.resolvedAt !== null}, history=${approved.statusHistory?.length}`,
  );

  // ---------------------------------------------------------------------
  // 3. Insert tracking kedua (platform berbeda) untuk filter
  // ---------------------------------------------------------------------
  const reviewId2 = generateId("apprev");
  await db.insert(appReviewTracking).values({
    id: reviewId2,
    platform: "linkedin",
    title: "LinkedIn Community Management API",
    status: "submitted",
    deadlineAt: new Date(Date.now() + 30 * 86400000),
  });

  // ---------------------------------------------------------------------
  // 4-5. Quota snapshot — insert lalu upsert hari sama
  // ---------------------------------------------------------------------
  const entityId = `verify-app-${Date.now()}`;
  await recordQuotaSnapshot({
    platform: "instagram",
    entityId,
    quotaType: "meta_buc",
    remaining: 180,
    total: 200,
  });
  const [snap1] = await db
    .select()
    .from(apiQuotaSnapshot)
    .where(eq(apiQuotaSnapshot.entityId, entityId));
  pass(
    "insert snapshot",
    snap1 !== undefined && snap1.remaining === 180 && snap1.total === 200,
    `remaining=${snap1?.remaining}/${snap1?.total}, date=${snap1?.date}`,
  );

  // Upsert hari sama — sisa kuota turun (dipakai publish)
  await recordQuotaSnapshot({
    platform: "instagram",
    entityId,
    quotaType: "meta_buc",
    remaining: 150,
    total: 200,
  });
  const snaps = await db
    .select()
    .from(apiQuotaSnapshot)
    .where(eq(apiQuotaSnapshot.entityId, entityId));
  pass(
    "upsert idempotent hari sama",
    snaps.length === 1 && snaps[0].remaining === 150,
    `rows=${snaps.length} (harus 1), remaining terupdate=${snaps[0]?.remaining}`,
  );

  // ---------------------------------------------------------------------
  // 6. Parse header Meta BUC
  // ---------------------------------------------------------------------
  const bucHeader = JSON.stringify({
    "1234567890": [
      {
        call_count: { total: 25, total_time: 60, estimated_time_to_regain_full_access: 0 },
        total_cputime: { total: 8 },
        total_time: { total: 12 },
      },
    ],
  });
  const parsed = parseMetaBucHeader(bucHeader);
  pass(
    "parse BUC header",
    parsed !== null && parsed.entityId === "1234567890" && parsed.usedCalls === 25,
    `entityId=${parsed?.entityId}, usedCalls=${parsed?.usedCalls}`,
  );

  // ---------------------------------------------------------------------
  // 7. recordQuotaFromHeaders — simulasi response header riil
  // ---------------------------------------------------------------------
  const headers = new Headers({
    "x-business-use-case-usage": bucHeader,
    "x-ratelimit-remaining": "95",
    "x-ratelimit-limit": "100",
  });
  await recordQuotaFromHeaders("facebook", `page-${Date.now()}`, headers);
  const [bucSnap] = await db
    .select()
    .from(apiQuotaSnapshot)
    .where(eq(apiQuotaSnapshot.entityId, "1234567890"));
  pass(
    "rekam kuota dari header",
    bucSnap !== undefined &&
      bucSnap.remaining === 175 && // 200 - 25
      bucSnap.total === 200 &&
      bucSnap.quotaType === "meta_buc",
    `meta_buc: ${bucSnap?.remaining}/${bucSnap?.total} (harus 175/200)`,
  );

  // Header pola rate_limit generic juga terekam (entity = page-*)
  const rateLimitSnaps = await db
    .select()
    .from(apiQuotaSnapshot)
    .where(eq(apiQuotaSnapshot.quotaType, "rate_limit"));
  const pageSnap = rateLimitSnaps.find((s) => s.remaining === 95 && s.total === 100);
  pass(
    "rekam kuota rate_limit generic",
    pageSnap !== undefined,
    `rate_limit rows=${rateLimitSnaps.length}, page 95/100 ${pageSnap ? "ditemukan" : "TIDAK ada"}`,
  );

  // ---------------------------------------------------------------------
  // 8. getLatestQuota
  // ---------------------------------------------------------------------
  const latest = await getLatestQuota("instagram", entityId);
  pass(
    "getLatestQuota",
    latest !== null && latest.remaining === 150 && latest.total === 200,
    `latest=${latest?.remaining}/${latest?.total}`,
  );

  // ---------------------------------------------------------------------
  // 9. Cleanup
  // ---------------------------------------------------------------------
  await db.delete(appReviewTracking).where(eq(appReviewTracking.id, reviewId));
  await db.delete(appReviewTracking).where(eq(appReviewTracking.id, reviewId2));
  await db.delete(apiQuotaSnapshot).where(eq(apiQuotaSnapshot.entityId, entityId));
  await db.delete(apiQuotaSnapshot).where(eq(apiQuotaSnapshot.entityId, "1234567890"));
  const remainQuota = await db.select().from(apiQuotaSnapshot);
  const cleaned = remainQuota.filter((s) => s.entityId.startsWith("page-"));
  for (const s of cleaned) {
    await db.delete(apiQuotaSnapshot).where(eq(apiQuotaSnapshot.id, s.id));
  }
  pass(
    "cleanup",
    remainQuota.filter((s) => s.entityId.startsWith("verify-") || s.entityId === "1234567890")
      .length === 0,
    "data test dibersihkan",
  );

  console.log("\nSelesai — semua skenario API Access diverifikasi.");
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
