import { NextRequest } from "next/server";
import { handleMetaWebhook, verifyMetaChallenge, verifyMetaSignature } from "@/lib/webhooks/meta";
import { webhookAck, webhookError, readWebhookBody } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * Facebook Page Webhooks (object `page`).
 * Setup di App Dashboard Meta → Webhooks → Facebook Page, callback = URL ini.
 */
export async function GET(req: NextRequest) {
    const challenge = await verifyMetaChallenge(new URL(req.url).searchParams);
    if (challenge === null) return webhookError("Challenge verification failed", 403);
    return new Response(challenge);
}

export async function POST(req: NextRequest) {
    const rawBody = await readWebhookBody(req);
    if (rawBody === null) return webhookError("Body too large", 413);
    if (!(await verifyMetaSignature(rawBody, req))) return webhookError("Invalid signature", 401);
    try {
        await handleMetaWebhook("page", rawBody);
        return webhookAck();
    } catch (err) {
        console.error("[webhook:facebook] gagal proses:", err);
        return webhookError("Failed to process", 500);
    }
}
