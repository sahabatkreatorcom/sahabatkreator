// Web Push sender — kirim push notification ke device user (web-push + VAPID).
// Dipakai server (route test) & worker (trigger publish fail/success, DM baru).
// Pattern sama dengan notify.ts: best-effort, error tidak boleh menggagalkan operasi utama.
import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "./index";
import { member, notificationSetting, pushSubscription, vapidKey } from "./schema";

/** Flag cache config VAPID — jangan hit DB tiap kirim */
let vapidConfigured = false;

/** Kategori preferensi notifikasi (kolom di notification_setting) */
const PREFERENCE_COLUMNS = {
  post_published: "postPublished",
  post_failed: "postFailed",
  new_comment: "newComment",
  new_dm: "newDm",
  new_mention: "newMention",
  new_review: "newReview",
} as const;

export type PushCategory = keyof typeof PREFERENCE_COLUMNS;

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const keys = webpush.generateVAPIDKeys();
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

/** Konfigurasi VAPID dari DB (private key terenkripsi). Cache per-proses. */
async function configureVapid(): Promise<boolean> {
  if (vapidConfigured) return true;
  const [row] = await db.select().from(vapidKey).where(eq(vapidKey.id, "singleton"));
  if (!row) return false;
  // Dekripsi inline (AES-256-GCM, format v1.iv.data.tag — sama dengan publishing crypto)
  const { decrypt } = await import("./crypto");
  const privateKey = decrypt(row.privateKeyEnc);
  webpush.setVapidDetails(
    row.contact ?? `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "support@sahabatkreator.com"}`,
    row.publicKey,
    privateKey,
  );
  vapidConfigured = true;
  return true;
}

/** Reset cache VAPID (dipanggil setelah admin rotate keys) */
export function resetVapidCache(): void {
  vapidConfigured = false;
}

/** Status VAPID — untuk cek cepat tanpa kirim */
export async function isVapidConfigured(): Promise<boolean> {
  if (vapidConfigured) return true;
  const [row] = await db
    .select({ id: vapidKey.id })
    .from(vapidKey)
    .where(eq(vapidKey.id, "singleton"));
  return Boolean(row);
}

export type PushPayload = {
  title: string;
  body: string;
  /** URL tujuan saat notifikasi diklik */
  url?: string;
  /** Tag untuk replace notifikasi lama sejenis (mis. per postId) */
  tag?: string;
  /** Tombol aksi di notifikasi (max 2) */
  actions?: Array<{ action: string; title: string }>;
};

/** Kirim push ke satu subscription. Auto-delete saat endpoint 404/410 (gone). */
async function sendToSubscription(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<"sent" | "gone"> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    await db
      .update(pushSubscription)
      .set({ lastNotifiedAt: new Date() })
      .where(eq(pushSubscription.id, subscription.id));
    return "sent";
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription tidak valid lagi (user clear browser / logout push service)
      await db.delete(pushSubscription).where(eq(pushSubscription.id, subscription.id));
      return "gone";
    }
    throw error;
  }
}

/** User org yang berhak menerima kategori ini (default ON bila belum ada setting row) */
async function eligibleUserIds(
  organizationId: string,
  category: PushCategory,
  roles: string[],
): Promise<string[]> {
  const members = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  const targetRoles = members.filter((m) => roles.includes(m.role)).map((m) => m.userId);
  if (targetRoles.length === 0) return [];

  // Ambil SEMUA setting row user tsb — bedakan "opt-out eksplisit" vs "belum ada row (default ON)"
  const settings = await db
    .select()
    .from(notificationSetting)
    .where(
      and(
        eq(notificationSetting.organizationId, organizationId),
        inArray(notificationSetting.userId, targetRoles),
      ),
    );
  const settingByUser = new Map(settings.map((s) => [s.userId, s]));
  const column = PREFERENCE_COLUMNS[category];
  return targetRoles.filter((userId) => {
    const s = settingByUser.get(userId);
    return s ? s[column] : true; // tanpa row → default ON
  });
}

/**
 * Broadcast push ke semua device user org untuk kategori tertentu.
 * Best-effort: per-subscription error tidak menghentikan yang lain.
 * Return jumlah terkirim.
 */
export async function pushToOrganization(
  organizationId: string,
  category: PushCategory,
  payload: PushPayload,
  roles: string[] = ["owner", "admin", "editor"],
): Promise<number> {
  try {
    if (!(await configureVapid())) return 0;
    const userIds = await eligibleUserIds(organizationId, category, roles);
    if (userIds.length === 0) return 0;

    const subscriptions = await db
      .select({
        id: pushSubscription.id,
        endpoint: pushSubscription.endpoint,
        p256dh: pushSubscription.p256dh,
        auth: pushSubscription.auth,
      })
      .from(pushSubscription)
      .where(
        and(
          eq(pushSubscription.organizationId, organizationId),
          inArray(pushSubscription.userId, userIds),
        ),
      );
    if (subscriptions.length === 0) return 0;

    let sent = 0;
    const results = await Promise.allSettled(
      subscriptions.map((s) => sendToSubscription(s, payload)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "sent") sent++;
    }
    return sent;
  } catch (error) {
    console.warn("[push] gagal kirim push:", error);
    return 0;
  }
}

/** Kirim push ke user spesifik (abaikan preferensi kategori — untuk notifikasi langsung) */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  try {
    if (!(await configureVapid())) return 0;
    const subscriptions = await db
      .select({
        id: pushSubscription.id,
        endpoint: pushSubscription.endpoint,
        p256dh: pushSubscription.p256dh,
        auth: pushSubscription.auth,
      })
      .from(pushSubscription)
      .where(eq(pushSubscription.userId, userId));
    if (subscriptions.length === 0) return 0;

    let sent = 0;
    const results = await Promise.allSettled(
      subscriptions.map((s) => sendToSubscription(s, payload)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value === "sent") sent++;
    }
    return sent;
  } catch (error) {
    console.warn("[push] gagal kirim push user:", error);
    return 0;
  }
}
