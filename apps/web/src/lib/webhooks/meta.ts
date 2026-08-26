import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { verifyHmacSha256, processWebhookEvent } from "./index";
import { getWebhookSecretConfig } from "./secrets";
import { upsertIncomingComment, type IncomingComment } from "@/lib/inbox/sync";
import { decryptToken } from "@/lib/token-encryption";
import { processAutomationForComment } from "@/lib/inbox-automation";
import type { Platform } from "@/lib/platforms/config";

/**
 * Meta Graph API Webhooks — handler bersama untuk objek `instagram`, `page`,
 * dan `threads`. Ketiganya punya callback URL sendiri di App Dashboard Meta,
 * tapi format payload & verifikasi signature sama (X-Hub-Signature-256 dari
 * App Secret).
 *
 * Event yang di-support per objek (field webhook):
 *   - instagram : comments, mentions
 *   - page      : comments, mentions, messaging
 *   - threads   : threads_replies
 *
 * Semua event komentar → upsert ke tabel `comment` (inbox) + jalankan
 * auto-reply bila cocok keyword.
 */

const META_SIGNATURE_HEADER = "x-hub-signature-256";

interface MetaCommentValue {
    id?: string;
    media_id?: string;
    media?: { id?: string };
    post_id?: string;
    from?: { id?: string; username?: string };
    user?: { id?: string; username?: string };
    text?: string;
    message?: string;
    reply_id?: string;
    created_time?: string;
    timestamp?: string;
    parent_id?: string;
}

interface MetaChange {
    field: string;
    value: MetaCommentValue;
}

interface MetaEntry {
    id: string;
    time?: number;
    changes?: MetaChange[];
}

export interface MetaWebhookPayload {
    object: "instagram" | "page" | "threads";
    entry?: MetaEntry[];
}

/** Object webhook Meta → platform internal kita. */
const OBJECT_TO_PLATFORM: Record<MetaWebhookPayload["object"], Platform[]> = {
    instagram: ["INSTAGRAM", "INSTAGRAM_PAGE"],
    page: ["FACEBOOK"],
    threads: ["THREADS"],
};

/** Field webhook yang memuat event komentar. */
const COMMENT_FIELDS = new Set(["comments", "comments_events", "mentions", "threads_replies"]);

/** Verifikasi handshake GET dari Meta (hub.mode / hub.verify_token / hub.challenge). */
export async function verifyMetaChallenge(searchParams: URLSearchParams, platform: Platform = "META"): Promise<string | null> {
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !challenge) return null;

    const secrets = await getWebhookSecretConfig(platform);
    if (token !== secrets.webhookVerifyToken) return null;
    return challenge;
}

function extractComment(change: MetaChange): IncomingComment | null {
    const v = change.value;
    if (!v) return null;

    const platformCommentId = v.id || v.reply_id || (v.media_id ? `media:${v.media_id}` : null);
    const platformPostId = v.media_id || v.media?.id || v.post_id || null;
    if (!platformCommentId || !platformPostId) return null;

    const from = v.from ?? v.user ?? {};
    const text = v.text ?? v.message ?? "";
    const timestamp = v.timestamp ?? v.created_time;

    return {
        platformCommentId,
        platformPostId,
        authorId: from.id || platformCommentId,
        authorUsername: from.username || "unknown",
        text,
        createdAt: timestamp ? new Date(timestamp) : new Date(),
        parentId: v.parent_id ?? null,
    };
}

/**
 * Proses payload webhook Meta. Mengembalikan jumlah komentar yang di-upsert.
 */
export async function handleMetaWebhook(
    object: MetaWebhookPayload["object"],
    rawBody: string,
): Promise<number> {
    const payload = JSON.parse(rawBody) as MetaWebhookPayload;
    if (!payload.entry?.length) return 0;

    const platforms = OBJECT_TO_PLATFORM[object];
    if (!platforms) return 0;

    let processed = 0;

    for (const entry of payload.entry) {
        if (!entry.changes?.length) continue;

        // entry.id = ID objek (user IG / Page FB / user Threads) → platformId di social_account.
        for (const change of entry.changes) {
            if (!COMMENT_FIELDS.has(change.field)) continue;
            const comment = extractComment(change);
            if (!comment) continue;

            // Temukan akun sosial berdasarkan (platform, platformId) TERLEBIH DAHULU
            // agar eventId bisa org-scoped (akun sama bisa terhubung ke >1 org).
            const account = await db.query.socialAccount.findFirst({
                where: (t, { and: _and, eq: _eq, inArray: _in }) =>
                    _and(
                        _in(t.platform, platforms),
                        _eq(t.platformId, entry.id),
                        _eq(t.isActive, true),
                    ),
                columns: {
                    id: true,
                    organizationId: true,
                    platform: true,
                    accessToken: true,
                },
            });
            if (!account) continue;

            const eventId = `meta:${object}:${account.organizationId}:${entry.id}:${comment.platformCommentId}:${change.field}`;
            const done = await processWebhookEvent(eventId, async () => {
                // Post internal yang cocok (platformPostId = media/post ID).
                const post = await db.query.post.findFirst({
                    where: (t, { and: _and, eq: _eq }) =>
                        _and(_eq(t.organizationId, account.organizationId), _eq(t.platformPostId, comment.platformPostId)),
                    columns: { id: true },
                });

                const result = await upsertIncomingComment(
                    {
                        id: account.id,
                        organizationId: account.organizationId,
                        platform: account.platform,
                        accessToken: decryptToken(account.accessToken),
                    },
                    post?.id ?? null,
                    comment,
                );

                if (result === "added") {
                    await processAutomationForComment({
                        organizationId: account.organizationId,
                        socialAccountId: account.id,
                        platform: account.platform,
                        platformPostId: comment.platformPostId,
                        platformCommentId: comment.platformCommentId,
                        authorUsername: comment.authorUsername,
                        text: comment.text,
                    });
                }
            });

            if (done) processed++;
        }
    }

    return processed;
}

/** Verifikasi signature payload webhook Meta (X-Hub-Signature-256 dari App Secret). */
export async function verifyMetaSignature(rawBody: string, req: Request, platform: Platform = "META"): Promise<boolean> {
    const secrets = await getWebhookSecretConfig(platform);
    if (!secrets.clientSecret) return false;
    return verifyHmacSha256(secrets.clientSecret, req.headers.get(META_SIGNATURE_HEADER), rawBody);
}

// ─────────────────────────────────────────────────────────────────────────────
// Threads Webhooks — format payload BERBEDA dari objek Meta biasa.
//
// Threads mengirim:
//   { app_id, topic, target_id, time, subscription_id,
//     values: { field: "replies"|"mentions"|..., value: { id, username, text,
//               replied_to, root_post, timestamp, profile_picture_url } } }
//
// BUKAN format Instagram/Page (entry[].changes[]).
// ─────────────────────────────────────────────────────────────────────────────

interface ThreadsWebhookValue {
    id?: string;
    username?: string;
    text?: string;
    media_type?: string;
    permalink?: string;
    replied_to?: { id?: string };
    root_post?: { id?: string; owner_id?: string };
    shortcode?: string;
    timestamp?: string;
    profile_picture_url?: string;
}

interface ThreadsWebhookPayload {
    app_id?: string;
    topic?: string;
    target_id?: string;
    time?: number;
    subscription_id?: string;
    values?: {
        field?: string;
        value?: ThreadsWebhookValue;
    };
}

/** Proses payload webhook Threads (topik replies & mentions). */
export async function handleThreadsWebhook(rawBody: string): Promise<number> {
    const payload = JSON.parse(rawBody) as ThreadsWebhookPayload;
    const field = payload.values?.field;
    if (field !== "replies" && field !== "mentions") return 0;
    const v = payload.values?.value;
    if (!v?.id) return 0;

    // platformPostId internal = root post (post PUBLISHED kita). root_post.id
    // adalah root thread; replied_to.id adalah parent terdekat.
    const platformPostId = v.root_post?.id || v.replied_to?.id || payload.target_id || null;
    if (!platformPostId) return 0;

    const comment: IncomingComment = {
        platformCommentId: String(v.id),
        platformPostId: String(platformPostId),
        authorId: String(v.id),
        authorUsername: v.username || "unknown",
        authorAvatar: v.profile_picture_url ?? null,
        text: v.text || "",
        createdAt: v.timestamp ? new Date(v.timestamp) : new Date(),
        parentId: v.replied_to?.id ? String(v.replied_to.id) : null,
    };

    // target_id = media ID (bukan user ID) untuk replies. Cocokkan akun via
    // root_post.owner_id (app-scoped Threads user ID) bila ada, fallback target_id.
    const ownerId = v.root_post?.owner_id || payload.target_id;
    if (!ownerId) return 0;

    const account = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.platform, "THREADS"), _eq(t.platformId, String(ownerId)), _eq(t.isActive, true)),
        columns: { id: true, organizationId: true, platform: true, accessToken: true },
    });
    if (!account) return 0;

    const eventId = `threads:${account.organizationId}:${comment.platformCommentId}:${field}`;
    const done = await processWebhookEvent(eventId, async () => {
        const post = await db.query.post.findFirst({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, account.organizationId), _eq(t.platformPostId, comment.platformPostId)),
            columns: { id: true },
        });

        const result = await upsertIncomingComment(
            {
                id: account.id,
                organizationId: account.organizationId,
                platform: account.platform,
                accessToken: decryptToken(account.accessToken),
            },
            post?.id ?? null,
            comment,
        );

        if (result === "added") {
            await processAutomationForComment({
                organizationId: account.organizationId,
                socialAccountId: account.id,
                platform: account.platform,
                platformPostId: comment.platformPostId,
                platformCommentId: comment.platformCommentId,
                authorUsername: comment.authorUsername,
                text: comment.text,
            });
        }
    });

    return done ? 1 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram standalone — subscription per-akun.
//
// Untuk Instagram API with Instagram Login (standalone), selain konfigurasi
// App Dashboard, tiap akun IG harus di-subscribe ke field webhook via:
//   POST graph.instagram.com/v26.0/{IG_USER_ID}/subscribed_apps
//        ?subscribed_fields=comments&access_token=<IG user token>
// Tanpa ini, Meta TIDAK mengirim webhook komentar untuk akun standalone.
// ─────────────────────────────────────────────────────────────────────────────

export async function subscribeInstagramCommentWebhook(igUserId: string, accessToken: string): Promise<boolean> {
    try {
        const res = await fetch(
            `https://graph.instagram.com/v26.0/${encodeURIComponent(igUserId)}/subscribed_apps` +
                `?subscribed_fields=comments&access_token=${encodeURIComponent(accessToken)}`,
            { method: "POST" },
        );
        const data = await res.json();
        if (!res.ok || data.error) {
            console.error(`[instagram-webhook] subscribe gagal user=${igUserId}:`, JSON.stringify(data));
            return false;
        }
        console.log(`[instagram-webhook] subscribed comments user=${igUserId}`);
        return true;
    } catch (e) {
        console.error(`[instagram-webhook] subscribe error:`, e instanceof Error ? e.message : e);
        return false;
    }
}
