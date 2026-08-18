import { NextRequest } from "next/server";
import { handleTikTokWebhook, verifyTikTokChallenge, verifyTikTokSignature } from "@/lib/webhooks/tiktok";
import { webhookAck, webhookError, readWebhookBody } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * TikTok Webhooks — Content Posting API.
 * Setup di developer portal TikTok → Content Posting API → Webhook, callback = URL ini.
 */
export async function GET(req: NextRequest) {
    const challenge = await verifyTikTokChallenge(new URL(req.url).searchParams);
    if (challenge === null) return webhookError("Missing challenge_code", 400);
    return new Response(challenge);
}

export async function POST(req: NextRequest) {
    const rawBody = await readWebhookBody(req);
    if (rawBody === null) return webhookError("Body too large", 413);
    if (!(await verifyTikTokSignature(rawBody, req.headers.get("x-tiktok-signature")))) {
        return webhookError("Invalid signature", 401);
    }
    try {
        await handleTikTokWebhook(rawBody);
        return webhookAck();
    } catch (err) {
        console.error("[webhook:tiktok] gagal proses:", err);
        return webhookError("Failed to process", 500);
    }
}
