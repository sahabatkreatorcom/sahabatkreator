// Helper notifikasi — kirim notifikasi ke anggota org (fan-out per member)
// Tabel: notification (schema/admin.ts) — userId, organizationId, type, title, body, linkUrl, isRead
import { eq } from "drizzle-orm";
import { db } from "./index";
import { member, notification } from "./schema";

/** ID generator — pola sama dengan apps/server/src/lib/id.ts (prefix sk_) */
function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}

/** Payload notifikasi baru */
export type NewNotification = {
  organizationId: string;
  /** Tipe: post_published | post_failed | engagement | billing | system | team */
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  /** Role yang berhak menerima (default: owner, admin, editor — bukan viewer) */
  roles?: string[];
};

/**
 * Kirim notifikasi ke anggota org sesuai role (fan-out insert per user).
 * Error TIDAK dilempar — notifikasi bersifat best-effort, jangan gagalkan
 * operasi utama (mis. publish) karena notifikasi gagal.
 */
export async function notifyOrganization(input: NewNotification): Promise<number> {
  try {
    const roles = input.roles ?? ["owner", "admin", "editor"];
    const rows = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, input.organizationId));
    const targets = rows.filter((r) => roles.includes(r.role)).map((r) => r.userId);

    if (targets.length === 0) return 0;
    await db.insert(notification).values(
      targets.map((userId) => ({
        id: generateId("notif"),
        userId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkUrl: input.linkUrl ?? null,
      })),
    );
    return targets.length;
  } catch (error) {
    console.error("[notify] gagal kirim notifikasi:", error);
    return 0;
  }
}

/** Kirim notifikasi ke satu user spesifik */
export async function notifyUser(input: {
  organizationId: string | null;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
}): Promise<void> {
  try {
    await db.insert(notification).values({
      id: generateId("notif"),
      userId: input.userId,
      organizationId: input.organizationId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      linkUrl: input.linkUrl ?? null,
    });
  } catch (error) {
    console.error("[notify] gagal kirim notifikasi user:", error);
  }
}
