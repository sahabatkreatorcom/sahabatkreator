// E2E verifikasi notifikasi — fan-out per role, unread count, read/dismiss, guard user.
// Jalankan: bun scripts/verify-notifications.ts (dari apps/server)

import { resolve } from "node:path";
import { db, notifyOrganization } from "@sahabatkreator/db";
import { member, notification, organization } from "@sahabatkreator/db/schema";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";

config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
  const pass = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} — ${name}: ${detail}`);
    if (!ok) process.exitCode = 1;
  };

  // Org + member pertama
  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    console.error("Tidak ada organization — jalankan signup dulu.");
    process.exit(1);
  }
  const members = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, org.id));
  if (members.length === 0) {
    console.error("Tidak ada member di org.");
    process.exit(1);
  }

  // Bersihkan notifikasi test org ini
  await db.delete(notification).where(eq(notification.organizationId, org.id));

  // Skenario 1: fan-out hanya ke role owner/admin/editor
  const sent = await notifyOrganization({
    organizationId: org.id,
    type: "post_published",
    title: "Test: post tayang",
    body: "instagram: test",
    linkUrl: "/posts",
  });
  const eligible = members.filter((m) => ["owner", "admin", "editor"].includes(m.role)).length;
  const rows = await db.select().from(notification).where(eq(notification.organizationId, org.id));
  pass(
    "fan-out sesuai role",
    sent === eligible && rows.length === eligible,
    `sent=${sent}, rows=${rows.length}, eligible(owner/admin/editor)=${eligible}, total member=${members.length}`,
  );

  // Skenario 2: unread semua notifikasi baru
  const unread = rows.filter((r) => !r.isRead);
  pass(
    "notifikasi baru unread",
    unread.length === rows.length,
    `unread=${unread.length}/${rows.length}`,
  );

  // Skenario 3: mark read satu notifikasi user pertama
  const target = rows[0];
  if (!target) {
    console.error("FAIL — tidak ada notifikasi untuk skenario mark read");
    process.exit(1);
  }
  await db
    .update(notification)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notification.id, target.id), eq(notification.userId, target.userId)));
  const [after] = await db.select().from(notification).where(eq(notification.id, target.id));
  pass(
    "mark read satu",
    after?.isRead === true && Boolean(after?.readAt),
    `isRead=${after?.isRead}`,
  );

  // Skenario 4: dismiss tidak bisa via user lain (guard: where userId user lain)
  const otherUser = rows.find((r) => r.userId !== target.userId);
  if (otherUser) {
    const wrong = await db
      .update(notification)
      .set({ dismissedAt: new Date() })
      .where(and(eq(notification.id, target.id), eq(notification.userId, otherUser.userId)))
      .returning({ id: notification.id });
    pass(
      "guard user (notif user lain tidak tersentuh)",
      wrong.length === 0,
      `updated=${wrong.length} (harus 0)`,
    );
  } else {
    console.log("SKIP — guard user (hanya 1 user di org)");
  }

  // Skenario 5: dismiss benar via pemilik
  const ok = await db
    .update(notification)
    .set({ dismissedAt: new Date() })
    .where(and(eq(notification.id, target.id), eq(notification.userId, target.userId)))
    .returning({ id: notification.id });
  pass("dismiss oleh pemilik", ok.length === 1, `updated=${ok.length}`);

  // Cleanup
  await db.delete(notification).where(eq(notification.organizationId, org.id));
  console.log("Cleanup selesai.");

  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
