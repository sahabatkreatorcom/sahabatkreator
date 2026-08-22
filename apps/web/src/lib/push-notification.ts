/**
 * Push Notification Library — kirim notifikasi push ke semua subscription VAPID.
 *
 * Menggunakan library `web-push` untuk mengirim notification ke browser client.
 * Dipakai saat: post berhasil/gagal publish, token sosial hampir expired, dll.
 */
import { db, schema } from "@sahabat-kreator/db";
import { and, eq } from "drizzle-orm";
import { env } from "@sahabat-kreator/env/server";
import { randomUUID } from "node:crypto";

let webPush: typeof import("web-push") | null = null;

function getWebPush(): typeof import("web-push") | null {
    if (!webPush) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            webPush = require("web-push");
        } catch {
            return null;
        }
    }
    return webPush;
}

async function getWebPushAsync(): Promise<typeof import("web-push") | null> {
    if (webPush) return webPush;
    try {
        const mod = await import("web-push");
        webPush = mod.default ?? mod;
        return webPush;
    } catch {
        return null;
    }
}

/**
 * Kirim notifikasi push ke semua subscription aktif di satu org.
 */
export async function sendPushNotification(opts: {
    organizationId: string;
    userId?: string | null;
    title: string;
    message: string;
    link?: string;
    type?: string;
}): Promise<{ sent: number; failed: number }> {
    const webPushLib = await getWebPushAsync();
    if (!webPushLib) {
        console.warn("[push] web-push tidak tersedia, lewati pengiriman notifikasi");
        return { sent: 0, failed: 0 };
    }

    const { organizationId, userId, title, message, link, type = "info" } = opts;

    // Simpan ke DB notification table (in-app bell)
    const notifId = randomUUID();
    await db.insert(schema.notification).values({
        id: notifId,
        organizationId,
        userId,
        title,
        message,
        type,
        link: link ?? null,
        isRead: false,
    });

    // Ambil semua subscription aktif
    const subs = await db.query.pushSubscription.findMany({
        where: and(
            eq(schema.pushSubscription.organizationId, organizationId),
            ...(userId ? [eq(schema.pushSubscription.userId, userId)] : [])
        ),
        columns: { endpoint: true, p256dh: true, auth: true },
    });

    if (!subs.length) return { sent: 0, failed: 0 };

    // Konfigurasi VAPID dari env
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
        console.warn("[push] VAPID keys tidak tersedia, lewati pengiriman notifikasi");
        return { sent: 0, failed: 0 };
    }
    webPushLib.setVapidDetails(
        env.VAPID_ADMIN_EMAIL ?? "admin@sahabatkreator.com",
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
    );

    let sent = 0;
    let failed = 0;

    for (const sub of subs) {
        try {
            await webPushLib.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                },
                JSON.stringify({
                    title,
                    body: message,
                    icon: "/logo.png",
                    badge: "/logo.png",
                    url: link ?? "/",
                    data: { notificationId: notifId },
                }),
            );
            sent++;
        } catch (err) {
            failed++;
            console.error(`[push] gagal kirim ke ${sub.endpoint}: ${err instanceof Error ? err.message : err}`);
            // Hapus subscription yang sudah tidak valid
            await db.delete(schema.pushSubscription)
                .where(eq(schema.pushSubscription.endpoint, sub.endpoint));
        }
    }

    return { sent, failed };
}

/**
 * Kirim notifikasi saat post berhasil dipublish.
 */
export async function notifyPostPublished(opts: {
    organizationId: string;
    postUrl?: string;
    platform: string;
}) {
    return sendPushNotification({
        organizationId: opts.organizationId,
        title: "Postingan Berhasil Dipublikasikan",
        message: `Postingan ${opts.platform} kamu sudah tayang!`,
        link: opts.postUrl,
        type: "publish_success",
    });
}

/**
 * Kirim notifikasi saat post gagal dipublish.
 */
export async function notifyPostFailed(opts: {
    organizationId: string;
    error: string;
    platform: string;
}) {
    return sendPushNotification({
        organizationId: opts.organizationId,
        title: "Postingan Gagal Dipublikasikan",
        message: `${opts.platform}: ${opts.error}`,
        type: "publish_failed",
    });
}

/**
 * Kirim notifikasi saat token sosial hampir expired.
 */
export async function notifyTokenExpiring(opts: {
    organizationId: string;
    userId?: string;
    platform: string;
    accountName: string;
}) {
    return sendPushNotification({
        organizationId: opts.organizationId,
        userId: opts.userId ?? null,
        title: "Token Sosial Hampir Expired",
        message: `Token ${opts.platform} (${opts.accountName}) akan expired. Silakan refresh token.`,
        link: "/dashboard/accounts",
        type: "token_expiring",
    });
}
