import { NextRequest } from "next/server";
import { eq, like } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { json, verifyCronSecret } from "@/lib/api";
import { logActivity } from "@/lib/activity-log";
import { decryptToken } from "@/lib/token-encryption";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TIKTOK_API_URL = "https://open.tiktokapis.com/v2";

/**
 * POST /api/cron/check-tiktok-pending — retry TikTok photo publish yang pending.
 *
 * Cari semua post berstatus PUBLISHING dengan platformPostId "tiktok_pending:*",
 * lalu check status-nya ke TikTok API. Jika sudah selesai → mark PUBLISHED,
 * jika gagal → mark FAILED.
 */
export const POST = async (req: NextRequest) => {
    if (!verifyCronSecret(req)) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    // silent — no per-run log unless there are posts to process

    // Ambil semua post PENDING TikTok — termasuk yang platformPostId kosong (stuck lama)
    const pending = await db.query.post.findMany({
        where: (t, { and: _and, eq: _eq, like: _like, or: _or, isNull: _isNull }) =>
            _and(
                _eq(t.status, "PUBLISHING"),
                _eq(t.platform, "TIKTOK"),
                _or(
                    _like(t.platformPostId, "tiktok_pending:%"),
                    _isNull(t.platformPostId),
                ),
            ),
        with: { socialAccount: true },
        columns: {
            id: true,
            organizationId: true,
            platformPostId: true,
            caption: true,
            socialAccountId: true,
        },
    });

    if (pending.length === 0) return json({ total: 0, resolved: 0, stillPending: 0, failed: 0 });

    console.log(`[check-tiktok-pending] ${pending.length} pending TikTok posts found`);

    let resolved = 0;
    let stillPending = 0;
    let failed = 0;

    for (const post of pending) {
        if (!post.socialAccount) continue;

        // Post tanpa platformPostId = belum pernah di-publish (bukan stuck lama).
        // Hanya process jika punya tiktok_pending: prefix.
        if (!post.platformPostId || !post.platformPostId.startsWith("tiktok_pending:")) {
            // Post tanpa ID sama sekali — tandai FAILED (publish gagal total)
            await db.update(schema.post)
                .set({ status: "FAILED" })
                .where(eq(schema.post.id, post.id));
            await db.insert(schema.publishError).values({
                id: randomUUID(),
                postId: post.id,
                platform: "TIKTOK",
                errorCode: "MISSING_PUBLISH_ID",
                errorRaw: "Post PUBLISHING tanpa platformPostId — publish awal gagal atau belum sempat kirim.",
                errorHuman: "Post tidak memiliki ID publish TikTok. Perlu publish ulang manual.",
                occurredAt: new Date(),
            });
            failed++;
            continue;
        }

        const publishId = post.platformPostId.replace("tiktok_pending:", "");
        const accessToken = decryptToken(post.socialAccount.accessToken);

        try {
            const res = await fetch(`${TIKTOK_API_URL}/post/publish/status/fetch/`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ publish_id: publishId }),
            });
            const data = await res.json();
            const status = data.data?.status;

            if (status === "PUBLISH_COMPLETE") {
                const ids = data.data?.publiclyAvailablePostId;
                const publicId = Array.isArray(ids) && ids.length > 0 ? String(ids[0]) : null;
                const accountName = post.socialAccount.name || "user";
                const tiktokUrl = publicId
                    ? `https://www.tiktok.com/@${accountName}/video/${publicId}`
                    : null;

                await db.update(schema.post)
                    .set({
                        status: "PUBLISHED",
                        publishedAt: new Date(),
                        platformPostId: publicId || post.platformPostId,
                        externalUrl: tiktokUrl,
                    })
                    .where(eq(schema.post.id, post.id));
                await logActivity(
                    post.organizationId,
                    "post.published",
                    { type: "post", id: post.id, name: (post.caption || "").slice(0, 100) },
                    { platform: "TIKTOK", platformPostId: publicId },
                );
                resolved++;
            } else if (status === "FAILED") {
                const failedReason = data.data?.fail_reason || "unknown";
                await db.update(schema.post)
                    .set({ status: "FAILED" })
                    .where(eq(schema.post.id, post.id));
                await db.insert(schema.publishError).values({
                    id: randomUUID(),
                    postId: post.id,
                    platform: "TIKTOK",
                    errorCode: `TIKTOK_FAILED:${failedReason}`,
                    errorRaw: JSON.stringify(data),
                    errorHuman: humanizeTikTokError(failedReason),
                    occurredAt: new Date(),
                });
                await logActivity(
                    post.organizationId,
                    "post.failed",
                    { type: "post", id: post.id, name: (post.caption || "").slice(0, 100) },
                    { platform: "TIKTOK", error: failedReason },
                );
                failed++;
            } else {
                stillPending++;
            }
        } catch (e) {
            stillPending++;
        }
    }

    const result = { total: pending.length, resolved, stillPending, failed };
    return json(result);
};

function humanizeTikTokError(reason: string): string {
    const map: Record<string, string> = {
        url_ownership_unverified: "Domain gambar belum diverifikasi di TikTok Developer Portal. Verifikasi domain di bagian URL Properties.",
        photo_pull_failed: "TikTok gagal mengunduh gambar. Pastikan URL gambar bisa diakses publik tanpa redirect.",
        picture_size_check_failed: "Ukuran gambar terlalu kecil (minimum 360px).",
        file_format_check_failed: "Format gambar tidak didukung. Gunakan JPG, JPEG, atau PNG.",
        spam_risk_too_many_posts: "Batas post harian tercapai.",
        spam_risk_user_banned_from_posting: "Akun diblokir dari posting.",
        spam_risk_too_many_pending_share: "Terlalu banyak post pending (maks 5 per 24 jam).",
        unaudited_client_can_only_post_to_private_accounts: "App belum di-audit TikTok. Hanya bisa post ke akun private.",
        access_token_invalid: "Token akses tidak valid atau sudah expired.",
        scope_not_authorized: "App belum mendapat izin video.publish.",
    };
    return map[reason] || `TikTok error: ${reason}`;
}
