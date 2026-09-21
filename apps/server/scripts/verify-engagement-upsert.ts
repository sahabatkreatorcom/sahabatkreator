// E2E verifikasi upsertEngagementItems — dedupe + reply tidak ditimpa.
// Jalankan: bun scripts/verify-engagement-upsert.ts (dari apps/server)
//
// Skenario:
// 1. Insert 2 item baru (platformItemId unik) → upsert → harus 2 baru
// 2. Upsert ulang item sama (konten beda) → harus 0 baru, konten ASLI dipertahankan
// 3. Update reply di salah satu item → upsert ulang → reply TIDAK ditimpa
// 4. Batch dengan duplikat internal → hanya 1 row per platformItemId

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import { engagementItem, socialAccount } from "@sahabatkreator/db/schema";
import { upsertEngagementItems } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  // Pakai akun connected pertama (atau akun manual) sebagai host test;
  // bila tidak ada → buat akun host sementara (dihapus di akhir).
  let [account] = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      username: socialAccount.username,
    })
    .from(socialAccount)
    .limit(1);
  let tempAccountId: string | null = null;
  if (!account) {
    console.log("Tidak ada socialAccount — buat akun host sementara...");
    const { organization } = await import("@sahabatkreator/db/schema");
    const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
    if (!org) {
      console.error("Tidak ada organization di DB — jalankan signup dulu.");
      process.exit(1);
    }
    tempAccountId = `sk_acc_test_${Date.now().toString(36)}`;
    await db.insert(socialAccount).values({
      id: tempAccountId,
      organizationId: org.id,
      platform: "manual",
      platformAccountId: tempAccountId,
      username: "host-e2e-test",
      displayName: "Host E2E Test (dihapus otomatis)",
      isConnected: false,
    });
    account = {
      id: tempAccountId,
      organizationId: org.id,
      platform: "manual",
      username: "host-e2e-test",
    };
  }
  console.log(`Host: ${account.platform}@${account.username ?? account.id} (${account.id})`);

  const suffix = Date.now().toString(36);
  const pidA = `sk_test_pid_${suffix}_a`;
  const pidB = `sk_test_pid_${suffix}_b`;
  const base = {
    socialAccountId: account.id,
    organizationId: account.organizationId,
    type: "comment" as const,
  };

  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Cleanup sisa test sebelumnya (idempotent re-run)
  const old = await db
    .select({ id: engagementItem.id })
    .from(engagementItem)
    .where(inArray(engagementItem.platformItemId, [pidA, pidB]));
  for (const row of old) {
    await db.delete(engagementItem).where(eq(engagementItem.id, row.id));
  }

  // Skenario 1: dua item baru
  const n1 = await upsertEngagementItems([
    { ...base, platformItemId: pidA, content: "Komentar asli A", authorUsername: "@budi" },
    { ...base, platformItemId: pidB, content: "Komentar asli B", authorUsername: "@sari" },
  ]);
  pass("insert baru", n1 === 2, `return ${n1} (harus 2)`);

  // Skenario 2: upsert ulang → 0 baru, konten asli dipertahankan
  const n2 = await upsertEngagementItems([
    {
      ...base,
      platformItemId: pidA,
      content: "KONTEN BERUBAH — jangan timpa",
      authorUsername: "@hack",
    },
  ]);
  const [rowA] = await db
    .select({
      content: engagementItem.content,
      authorUsername: engagementItem.authorUsername,
      status: engagementItem.status,
    })
    .from(engagementItem)
    .where(
      and(eq(engagementItem.socialAccountId, account.id), eq(engagementItem.platformItemId, pidA)),
    );
  pass(
    "dedupe upsert ulang",
    n2 === 0 && rowA?.content === "Komentar asli A" && rowA?.authorUsername === "@budi",
    `return ${n2}, content=${JSON.stringify(rowA?.content)}, author=${JSON.stringify(rowA?.authorUsername)}`,
  );

  // Skenario 3: reply user tetap utuh setelah sync baru
  await db
    .update(engagementItem)
    .set({
      status: "replied",
      platformReplyId: `sk_reply_${suffix}`,
      replyContent: "Terima kasih kakak!",
      repliedAt: new Date(),
    })
    .where(
      and(eq(engagementItem.socialAccountId, account.id), eq(engagementItem.platformItemId, pidB)),
    );
  const n3 = await upsertEngagementItems([
    { ...base, platformItemId: pidB, content: "KONTEN BERUBAH — jangan timpa reply" },
  ]);
  const [rowB] = await db
    .select({
      status: engagementItem.status,
      platformReplyId: engagementItem.platformReplyId,
      replyContent: engagementItem.replyContent,
    })
    .from(engagementItem)
    .where(
      and(eq(engagementItem.socialAccountId, account.id), eq(engagementItem.platformItemId, pidB)),
    );
  pass(
    "reply tidak ditimpa",
    n3 === 0 &&
      rowB?.status === "replied" &&
      rowB?.platformReplyId === `sk_reply_${suffix}` &&
      rowB?.replyContent === "Terima kasih kakak!",
    `return ${n3}, status=${rowB?.status}, platformReplyId=${JSON.stringify(rowB?.platformReplyId)}`,
  );

  // Skenario 4: duplikat dalam satu batch
  const n4 = await upsertEngagementItems([
    { ...base, platformItemId: pidA, content: "dup 1" },
    { ...base, platformItemId: pidA, content: "dup 2" },
  ]);
  const countA = await db
    .select({ id: engagementItem.id })
    .from(engagementItem)
    .where(
      and(eq(engagementItem.socialAccountId, account.id), eq(engagementItem.platformItemId, pidA)),
    );
  pass("duplikat batch", n4 === 0 && countA.length === 1, `return ${n4}, rows=${countA.length}`);

  // Cleanup data test
  await db
    .delete(engagementItem)
    .where(
      and(
        eq(engagementItem.socialAccountId, account.id),
        inArray(engagementItem.platformItemId, [pidA, pidB]),
      ),
    );
  if (tempAccountId) {
    await db.delete(socialAccount).where(eq(socialAccount.id, tempAccountId));
    console.log("Akun host sementara dihapus.");
  }
  console.log("Cleanup selesai — data test dihapus.");
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
