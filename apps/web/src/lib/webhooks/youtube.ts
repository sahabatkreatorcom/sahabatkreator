import { db, schema } from "@sahabat-kreator/db";
import { processWebhookEvent } from "./index";
import { getWebhookSecretConfig } from "./secrets";

/**
 * YouTube — PubSubHubbub push notifications.
 *
 * Berbeda dari webhook JSON biasa: YouTube mengirim **Atom feed XML** saat
 * channel yang disubscribe meng-upload/mengupdate video. Setup:
 *   1. Callback server menerima GET `hub.mode=subscribe&hub.topic=...&hub.challenge=...&hub.verify_token=...`.
 *   2. Setelah disetujui hub (pubsubhubbub.appspot.com), POST berisi feed.
 *
 * Karena kita meng-upload video (bukan subscribe channel orang lain), webhook
 * ini opsional — dipakai untuk mencatat video baru channel akun sendiri agar
 * tidak perlu polling `videos.list`.
 */

interface YtVideoEntry {
    videoId?: string;
    channelId?: string;
    title?: string;
    published?: string;
    updated?: string;
    alternateUrl?: string;
}

function parseAtomFeed(xml: string): YtVideoEntry[] {
    const videos: YtVideoEntry[] = [];

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(xml)) !== null) {
        const block = m[1];
        const grab = (tag: string) => {
            const r = new RegExp(`<yt:${tag}>([\\s\\S]*?)<\\/yt:${tag}>`);
            const g = block.match(r);
            return g ? g[1].trim() : undefined;
        };
        const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const published = block.match(/<published[^>]*>([\s\S]*?)<\/published>/);
        const updated = block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);
        const link = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);

        videos.push({
            videoId: grab("videoId"),
            channelId: grab("channelId"),
            title: title ? title[1].trim() : undefined,
            published: published ? published[1].trim() : undefined,
            updated: updated ? updated[1].trim() : undefined,
            alternateUrl: link ? link[1] : undefined,
        });
    }
    return videos;
}

export async function verifyYoutubeChallenge(searchParams: URLSearchParams): Promise<string | null> {
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode !== "subscribe" && mode !== "unsubscribe") return null;
    if (!challenge) return null;

    const secrets = await getWebhookSecretConfig("YOUTUBE");
    if (token !== secrets.webhookVerifyToken) return null;
    return challenge;
}

/** Proses feed YouTube (Atom XML), catat video baru ke media/activity. */
export async function handleYoutubeFeed(xml: string): Promise<number> {
    const videos = parseAtomFeed(xml);
    let processed = 0;

    for (const video of videos) {
        if (!video.videoId || !video.channelId) continue;
        const videoId = video.videoId;
        const channelId = video.channelId;

        const eventId = `youtube:${videoId}`;
        const done = await processWebhookEvent(eventId, async () => {
            // Temukan akun YouTube dengan channelId yang cocok.
            const account = await db.query.socialAccount.findFirst({
                where: (t, { and: _and, eq: _eq }) =>
                    _and(_eq(t.platform, "YOUTUBE"), _eq(t.platformId, channelId), _eq(t.isActive, true)),
                columns: { id: true, organizationId: true },
            });
            if (!account) return;

            const url = video.alternateUrl || `https://www.youtube.com/watch?v=${videoId}`;
            const created = video.published ? new Date(video.published) : new Date();

            // Catat sebagai aktivitas org.
            await db
                .insert(schema.activity)
                .values({
                    id: crypto.randomUUID(),
                    organizationId: account.organizationId,
                    action: "post.published",
                    resourceType: "post",
                    resourceId: videoId,
                    resourceName: video.title || `YouTube video ${videoId}`,
                    details: JSON.stringify({ platform: "YOUTUBE", url, externalId: videoId }),
                    createdAt: created,
                });
        });

        if (done) processed++;
    }

    return processed;
}
