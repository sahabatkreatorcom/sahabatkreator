import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { eq, and } from "drizzle-orm";
import { processWebhookEvent } from "./index";
import { getWebhookSecretConfig } from "./secrets";

/**
 * TikTok Webhooks — Content Posting API.
 *
 * Envelope resmi per event:
 *   { client_key, event, create_time, user_openid, content }
 * `content` berupa JSON string (struktur berbeda per event).
 *
 * Event yang di-support:
 *   - post.publish.complete : `content.post_id` → update post status PUBLISHED + platformPostId
 *   - post.publish.fail     : `content.error` → status FAILED + publish_error
 *
 * Verifikasi:
 *   - GET  : TikTok mengirim `challenge_code` → echo nilai tersebut.
 *   - POST : header `X-TikTok-Signature` berformat `t=<unix_ts>,s=<hmac_hex>`, dengan
 *            `hmac = HMAC-SHA256(client_secret, "<ts>.<rawBody>")`. Cek juga freshness
 *            timestamp (toleransi 5 menit) untuk mencegah replay.
 */

interface TikTokContentPayload {
    post_id?: string;
    video_id?: string;
    share_id?: string;
    status?: string;
    error?: { code?: string; message?: string };
}

interface TikTokWebhookPayload {
    client_key?: string;
    event?: string;
    create_time?: number;
    user_openid?: string;
    content?: string;
}

const TIKTOK_SIGNATURE_HEADER = "x-tiktok-signature";
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000; // 5 menit

export async function verifyTikTokSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
    const secrets = await getWebhookSecretConfig("TIKTOK");
    const secret = secrets.clientSecret;
    if (!secret || !signatureHeader) return false;

    // Format: t=<timestamp>,s=<hex>
    const tMatch = signatureHeader.match(/(?:^|,)\s*t=(\d+)/);
    const sMatch = signatureHeader.match(/(?:^|,)\s*s=([a-f0-9]+)/);
    if (!tMatch || !sMatch) return false;

    const timestamp = Number(tMatch[1]);
    if (!Number.isFinite(timestamp)) return false;

    // Freshness — tolak signature lama (replay protection).
    if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_MS / 1000) return false;

    const signedPayload = `${tMatch[1]}.${rawBody}`;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

    const a = Buffer.from(expected);
    const b = Buffer.from(sMatch[1]);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

function parseContent(content: string | undefined): TikTokContentPayload {
    if (!content) return {};
    try {
        const parsed = JSON.parse(content);
        return (parsed && typeof parsed === "object" ? parsed : {}) as TikTokContentPayload;
    } catch {
        return {};
    }
}

/** Proses payload webhook TikTok, return jumlah post yang diupdate. */
export async function handleTikTokWebhook(rawBody: string): Promise<number> {
    const payload = JSON.parse(rawBody) as TikTokWebhookPayload;
    const event = payload.event;
    const userOpenId = payload.user_openid;
    if (!event || !userOpenId) return 0;

    const data = parseContent(payload.content);
    const postId = data.post_id ?? data.share_id ?? data.video_id ?? null;
    if (!postId) return 0;

    const eventId = `tiktok:${event}:${userOpenId}:${postId}`;
    let updated = 0;

    await processWebhookEvent(eventId, async () => {
        // Temukan akun TikTok berdasarkan platformId (open_id).
        const account = await db.query.socialAccount.findFirst({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.platform, "TIKTOK"), _eq(t.platformId, userOpenId), _eq(t.isActive, true)),
            columns: { id: true, organizationId: true, name: true },
        });
        if (!account) return;

        // Post yang cocok: belum terbit + platformPostId == publish id TikTok (share_id)
        // atau masih SCHEDULED/PUBLISHING di akun tsb. Urutan deterministik (terbaru dulu).
        const post = await db.query.post.findFirst({
            where: (t, { and: _and, eq: _eq, inArray: _in }) =>
                _and(
                    _eq(t.organizationId, account.organizationId),
                    _eq(t.socialAccountId, account.id),
                    _in(t.status, ["SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"]),
                ),
            columns: { id: true, status: true, platformPostId: true, externalUrl: true },
        });
        if (!post) return;

        if (event === "post.publish.complete") {
            // postId dari webhook adalah ID publik TikTok
            const publicId = postId;
            const accountName = account.name || "user";
            const tiktokUrl = publicId ? `https://www.tiktok.com/@${accountName}/video/${publicId}` : null;

            await db
                .update(schema.post)
                .set({
                    status: "PUBLISHED",
                    publishedAt: new Date(),
                    platformPostId: post.platformPostId || publicId,
                    externalUrl: tiktokUrl || post.externalUrl,
                })
                .where(eq(schema.post.id, post.id));
            updated++;
        } else if (event === "post.publish.fail" || event === "post.publish.fail_by_user") {
            const msg = data.error?.message || data.error?.code || "Publish TikTok gagal.";
            await db
                .update(schema.post)
                .set({ status: "FAILED" })
                .where(eq(schema.post.id, post.id));
            await db
                .insert(schema.publishError)
                .values({
                    id: crypto.randomUUID(),
                    postId: post.id,
                    platform: "TIKTOK",
                    errorCode: data.error?.code || "PUBLISH_FAILED",
                    errorRaw: msg,
                    errorHuman: msg,
                    occurredAt: new Date(),
                });
            updated++;
        }
    });

    return updated;
}

/** Handshake GET: echo `challenge_code` bila valid (client_key cocok). */
export async function verifyTikTokChallenge(searchParams: URLSearchParams): Promise<string | null> {
    const challenge = searchParams.get("challenge_code");
    const clientKey = searchParams.get("client_key");
    if (!challenge) return null;
    const secrets = await getWebhookSecretConfig("TIKTOK");
    if (secrets.clientId && clientKey !== secrets.clientId) return null;
    return challenge;
}
