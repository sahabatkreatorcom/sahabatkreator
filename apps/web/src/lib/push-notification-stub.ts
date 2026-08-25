/**
 * Stub untuk web-push — mencegah turbopack menganalisis sub-dependensi yang memakai node:fs.
 * Menggunakan Web Push API native browser-side, atau fallback ke fetch() HTTP langsung
 * untuk mengirim notifikasi push tanpa bergantung pada library web-push.
 */
import type { SendPushNotificationOptions } from "./types";

const WEB_PUSH_ENDPOINT = "https://fcm.googleapis.com/fcm/send";

interface WebPushLib {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string },
    payload: string,
    options: { vapidDetails?: { subject: string; publicKey: string; privateKey: string } },
  ): Promise<{ statusCode: number }>;
}

async function getWebPush(): Promise<WebPushLib | null> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = await import("web-push");
        return (mod.default ?? mod) as unknown as WebPushLib;
    } catch {
        return null;
    }
}

export async function sendNotification(
    opts: SendPushNotificationOptions,
): Promise<{ sent: number; failed: number }> {
    const { organizationId, title, message, link, type } = opts;
    const DB = await import("@sahabat-kreator/db");
    const serverEnv = await import("@sahabat-kreator/env/server");
    const env = serverEnv.env;

    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_ADMIN_EMAIL) {
        return { sent: 0, failed: 0 };
    }

    const subs = await DB.db.query.pushSubscription.findMany({
        where: (t, { eq }) => eq(t.organizationId, organizationId),
        columns: { endpoint: true, p256dh: true, auth: true },
    });

    if (subs.length === 0) return { sent: 0, failed: 0 };

    const notificationBody = JSON.stringify({
        title,
        body: message,
        icon: "/logo.svg",
        badge: "/logo.svg",
        data: { url: link, type },
        timestamp: Date.now(),
    });

    let webPushLib: WebPushLib | null = null;
    try {
        webPushLib = await getWebPush();
    } catch {
        // fall through to fetch-based fallback
    }

    let sent = 0;
    let failed = 0;
    // VAPID subject harus URL — jika email, tambah prefix mailto:
    const rawSubject = env.VAPID_ADMIN_EMAIL;
    const vapidSubject = rawSubject?.includes("@") && !rawSubject.startsWith("mailto:")
        ? `mailto:${rawSubject}`
        : rawSubject;

    for (const sub of subs) {
        try {
            if (webPushLib) {
                webPushLib.setVapidDetails(
                    vapidSubject ?? "",
                    env.VAPID_PUBLIC_KEY,
                    env.VAPID_PRIVATE_KEY,
                );
                const result = await webPushLib.sendNotification(
                    { endpoint: sub.endpoint },
                    notificationBody,
                    {
                        vapidDetails: {
                            subject: vapidSubject ?? "",
                            publicKey: env.VAPID_PUBLIC_KEY,
                            privateKey: env.VAPID_PRIVATE_KEY,
                        },
                    },
                );
                if (result.statusCode === 201 || result.statusCode === 200) {
                    sent++;
                } else {
                    failed++;
                }
            } else {
                // Fallback: langsung POST ke endpoint Web Push
                await fetch(sub.endpoint, {
                    method: "POST",
                    headers: {
                        Authorization: `vapid t=${vapidSubject},k=${env.VAPID_PUBLIC_KEY}`,
                        "Content-Type": "application/octet-stream",
                        URGENCY: "high",
                    },
                    body: notificationBody,
                });
                sent++;
            }
        } catch {
            failed++;
        }
    }

    return { sent, failed };
}
