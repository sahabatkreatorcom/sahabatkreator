import { NextRequest } from "next/server";
import { handleYoutubeFeed, verifyYoutubeChallenge } from "@/lib/webhooks/youtube";
import { webhookAck, webhookError, readWebhookBody } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * YouTube PubSubHubbub callback.
 * GET = handshake hub (subscribe/unsubscribe), POST = Atom feed notifikasi.
 * Setup: subscribe via hub dengan topic `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`.
 */
export async function GET(req: NextRequest) {
    const challenge = await verifyYoutubeChallenge(new URL(req.url).searchParams);
    if (challenge === null) return webhookError("Challenge verification failed", 403);
    return new Response(challenge);
}

export async function POST(req: NextRequest) {
    const xml = await readWebhookBody(req);
    if (xml === null) return webhookError("Body too large", 413);
    if (!xml) return webhookError("Empty body", 400);
    try {
        await handleYoutubeFeed(xml);
        return webhookAck();
    } catch (err) {
        console.error("[webhook:youtube] gagal proses:", err);
        return webhookError("Failed to process", 500);
    }
}
