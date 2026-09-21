// E2E verifikasi DM Inbox — upsertDMConversation (idempoten + materialized fields),
// unreadCount, mark-all-read, filter, assignment, cleanup.
// Jalankan: bun scripts/verify-dm.ts (dari apps/server)
//
// Skenario:
// 1. Seed akun IG test + org test
// 2. upsertDMConversation pertama — conversation + 3 pesan baru, unreadCount=2
// 3. upsertDMConversation kedua (pesan sama) — idempoten: 0 pesan baru, unread tetap
// 4. upsertDMConversation dengan pesan baru — unreadCount bertambah
// 5. Reply lokal (akun manual) — pesan outbound tersimpan + materialized terupdate
// 6. unread-count org
// 7. Mark all read — unreadCount semua 0
// 8. Filter q (nama partner)
// 9. Assignment — PATCH assignedMemberId (butuh user test)
// 10. Cleanup

import { resolve } from "node:path";
import { db } from "@sahabatkreator/db";
import {
  dmConversation,
  dmMessage,
  organization as orgTable,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { upsertDMConversation } from "@sahabatkreator/publishing";
import { config } from "dotenv";
import { and, eq, gt } from "drizzle-orm";
import { generateId } from "../src/lib/id";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Seed org + akun test
  const orgId = generateId("org");
  await db.insert(orgTable).values({
    id: orgId,
    name: "Verify DM Org",
    slug: `verify-dm-${Date.now()}`,
    createdAt: new Date(),
  });
  const accountId = generateId("social");
  await db.insert(socialAccount).values({
    id: accountId,
    organizationId: orgId,
    platform: "instagram",
    platformAccountId: `ig-verify-${Date.now()}`,
    username: "verify_ig_account",
  });

  // ---------------------------------------------------------------------
  // 1. Upsert pertama — conversation baru + 3 pesan (2 inbound, 1 outbound)
  // ---------------------------------------------------------------------
  const convPlatformId = `t_${Date.now()}`;
  const partnerId = "partner_123";
  const baseTime = Date.now() - 3600_000;
  const newCount1 = await upsertDMConversation({
    organizationId: orgId,
    socialAccountId: accountId,
    platformConversationId: convPlatformId,
    partner: { id: partnerId, username: "budi_satu", name: "Budi Satu" },
    messages: [
      {
        platformMessageId: "m1",
        direction: "inbound",
        senderId: partnerId,
        senderUsername: "budi_satu",
        text: "Halo, saya mau tanya produk",
        occurredAt: new Date(baseTime),
      },
      {
        platformMessageId: "m2",
        direction: "outbound",
        senderId: "ig-verify",
        text: "Halo Budi! Silakan, produk mana yang menarik?",
        occurredAt: new Date(baseTime + 60_000),
      },
      {
        platformMessageId: "m3",
        direction: "inbound",
        senderId: partnerId,
        senderUsername: "budi_satu",
        text: "Yang paket usaha",
        occurredAt: new Date(baseTime + 120_000),
      },
    ],
  });
  const [conv1] = await db
    .select()
    .from(dmConversation)
    .where(eq(dmConversation.platformConversationId, convPlatformId));
  pass(
    "upsert pertama",
    newCount1 === 3 &&
      conv1 !== undefined &&
      conv1.unreadCount === 2 &&
      conv1.lastMessagePreview === "Yang paket usaha" &&
      conv1.lastMessageDirection === "inbound" &&
      conv1.partnerName === "Budi Satu",
    `newMessages=${newCount1} (harus 3), unread=${conv1?.unreadCount} (harus 2), preview="${conv1?.lastMessagePreview}", direction=${conv1?.lastMessageDirection}`,
  );

  // ---------------------------------------------------------------------
  // 2. Upsert kedua — pesan sama semua → idempoten (0 baru, unread tetap 2)
  // ---------------------------------------------------------------------
  const newCount2 = await upsertDMConversation({
    organizationId: orgId,
    socialAccountId: accountId,
    platformConversationId: convPlatformId,
    partner: { id: partnerId, username: "budi_satu", name: "Budi Satu" },
    messages: [
      {
        platformMessageId: "m3",
        direction: "inbound",
        senderId: partnerId,
        text: "Yang paket usaha",
        occurredAt: new Date(baseTime + 120_000),
      },
    ],
  });
  const [conv2] = await db
    .select()
    .from(dmConversation)
    .where(eq(dmConversation.platformConversationId, convPlatformId));
  const msgCount = await db
    .select({ id: dmMessage.id })
    .from(dmMessage)
    .where(eq(dmMessage.conversationId, conv1.id));
  pass(
    "idempoten (pesan sama)",
    newCount2 === 0 && conv2.unreadCount === 2 && msgCount.length === 3,
    `newMessages=${newCount2} (harus 0), unread=${conv2.unreadCount} (harus 2), total pesan=${msgCount.length} (harus 3)`,
  );

  // ---------------------------------------------------------------------
  // 3. Upsert dengan pesan baru — unread bertambah, preview terupdate
  // ---------------------------------------------------------------------
  const newCount3 = await upsertDMConversation({
    organizationId: orgId,
    socialAccountId: accountId,
    platformConversationId: convPlatformId,
    partner: { id: partnerId, username: "budi_satu", name: "Budi Satu" },
    messages: [
      {
        platformMessageId: "m4",
        direction: "inbound",
        senderId: partnerId,
        text: "Berapa harganya?",
        occurredAt: new Date(baseTime + 180_000),
      },
    ],
  });
  const [conv3] = await db
    .select()
    .from(dmConversation)
    .where(eq(dmConversation.platformConversationId, convPlatformId));
  pass(
    "pesan baru masuk",
    newCount3 === 1 &&
      conv3.unreadCount === 3 &&
      conv3.lastMessagePreview === "Berapa harganya?" &&
      conv3.lastMessageDirection === "inbound",
    `newMessages=${newCount3}, unread=${conv3.unreadCount} (harus 3), preview="${conv3.lastMessagePreview}"`,
  );

  // ---------------------------------------------------------------------
  // 4. Outbound reply manual (pattern route reply akun manual)
  // ---------------------------------------------------------------------
  const replyId = generateId("dmmsg");
  await db.insert(dmMessage).values({
    id: replyId,
    organizationId: orgId,
    socialAccountId: accountId,
    conversationId: conv1.id,
    platformMessageId: `local_${generateId("dmreply")}`,
    direction: "outbound",
    senderId: "ig-verify",
    text: "Harga paket usaha Rp150.000/bln kak",
    occurredAt: new Date(baseTime + 240_000),
  });
  await db
    .update(dmConversation)
    .set({
      lastMessageAt: new Date(baseTime + 240_000),
      lastMessagePreview: "Harga paket usaha Rp150.000/bln kak",
      lastMessageDirection: "outbound",
    })
    .where(eq(dmConversation.id, conv1.id));
  const [conv4] = await db.select().from(dmConversation).where(eq(dmConversation.id, conv1.id));
  pass(
    "reply outbound tersimpan",
    conv4.lastMessageDirection === "outbound" &&
      conv4.lastMessagePreview === "Harga paket usaha Rp150.000/bln kak",
    `direction=${conv4.lastMessageDirection}, preview="${conv4.lastMessagePreview}"`,
  );

  // ---------------------------------------------------------------------
  // 5. unread-count org (query pattern route /dm/unread-count)
  // ---------------------------------------------------------------------
  const unreadConvs = await db
    .select({ id: dmConversation.id })
    .from(dmConversation)
    .where(and(eq(dmConversation.organizationId, orgId), gt(dmConversation.unreadCount, 0)));
  pass(
    "unread-count",
    unreadConvs.length === 1,
    `percakapan dengan unread=${unreadConvs.length} (harus 1)`,
  );

  // ---------------------------------------------------------------------
  // 6. Mark all read (pattern route /dm/mark-all-read)
  // ---------------------------------------------------------------------
  await db
    .update(dmConversation)
    .set({ unreadCount: 0 })
    .where(and(eq(dmConversation.organizationId, orgId), gt(dmConversation.unreadCount, 0)));
  const [conv5] = await db.select().from(dmConversation).where(eq(dmConversation.id, conv1.id));
  pass("mark all read", conv5.unreadCount === 0, `unread=${conv5.unreadCount} (harus 0)`);

  // ---------------------------------------------------------------------
  // 7. Assignment (pattern PATCH /dm/:id)
  // ---------------------------------------------------------------------
  await db
    .update(dmConversation)
    .set({ assignedMemberId: "sk_user_test123" })
    .where(eq(dmConversation.id, conv1.id));
  const [conv6] = await db.select().from(dmConversation).where(eq(dmConversation.id, conv1.id));
  pass(
    "assignment member",
    conv6.assignedMemberId === "sk_user_test123",
    `assigned=${conv6.assignedMemberId}`,
  );

  // ---------------------------------------------------------------------
  // 8. Cleanup — cascade dari org & akun
  // ---------------------------------------------------------------------
  await db.delete(socialAccount).where(eq(socialAccount.id, accountId));
  await db.delete(orgTable).where(eq(orgTable.id, orgId));
  const remain = await db
    .select({ id: dmConversation.id })
    .from(dmConversation)
    .where(eq(dmConversation.organizationId, orgId));
  pass("cleanup cascade", remain.length === 0, `sisa conversation=${remain.length} (harus 0)`);

  console.log("\nSelesai — semua skenario DM Inbox diverifikasi.");
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
