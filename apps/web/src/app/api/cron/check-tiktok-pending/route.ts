import { NextRequest } from "next/server";
import { and, eq, like } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { json, verifyCronSecret } from "@/lib/api";
import { logActivity } from "@/lib/activity-log";
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

    // Ambil semua post PENDING TikTok
    const pending = await db.query.post.findMany({
        where: (t, { and: _and, eq: _eq, like: _like }) =>
            _and(_eq(t.status, "PUBLISHING"), _like(t.platformPostId, "tiktok_pending:%")),
        with: { socialAccount: true },
        columns: {
            id: true,
            organizationId: true,
            platformPostId: true,
            caption: true,
            socialAccountId: true,
        },
    });

    let resolved = 0;
    let stillPending = 0;
    let failed = 0;

    for (const post of pending) {
        if (!post.socialAccount || !post.platformPostId) continue;

        const publishId = post.platformPostId.replace("tiktok_pending:", "");
        const accessToken = post.socialAccount.accessToken;

        try {
            const res = await fetch(`${TIKTOK_API_URL}/post/publish/status/fetch/`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ publish_id: publishId }),
            });
            const data = await res.json();
            const status = data.data?.status;

            if (status === "PUBLISH_COMPLETE") {
                const publicId = data.data?.publiclyAvailablePostId?.[0];
                if (publicId && /^\d+$/.test(String(publicId))) {
                    await db.update(schema.post)
                        .set({
                            status: "PUBLISHED",
                            publishedAt: new Date(),
                            platformPostId: String(publicId),
                        })
                        .where(eq(schema.post.id, post.id));
                    await logActivity(
                        post.organizationId,
                        "post.published",
                        { type: "post", id: post.id, name: (post.caption || "").slice(0, 100) },
                        { platform: "TIKTOK" },
                    );
                    resolved++;
                } else {
                    // Complete tapi ID tidak valid
                    await db.update(schema.post)
                        .set({ status: "FAILED" })
                        .where(eq(schema.post.id, post.id));
                    await db.insert(schema.publishError).values({
                        id: randomUUID(),
                        postId: post.id,
                        platform: "TIKTOK",
                        errorCode: "INVALID_POST_ID",
                        errorRaw: "TikTok publish complete tapi public ID tidak valid.",
                        errorHuman: "TikTok selesai publish tapi ID post tidak dikenali.",
                        occurredAt: new Date(),
                    });
                    failed++;
                }
            } else if (status === "FAILED") {
                await db.update(schema.post)
                    .set({ status: "FAILED" })
                    .where(eq(schema.post.id, post.id));
                await db.insert(schema.publishError).values({
                    id: randomUUID(),
                    postId: post.id,
                    platform: "TIKTOK",
                    errorCode: "TIKTOK_FAILED",
                    errorRaw: data.data?.failed_reason || "TikTok report status FAILED.",
                    errorHuman: "TikTok gagal memproses foto.",
                    occurredAt: new Date(),
                });
                await logActivity(
                    post.organizationId,
                    "post.failed",
                    { type: "post", id: post.id, name: (post.caption || "").slice(0, 100) },
                    { platform: "TIKTOK", error: "TikTok status FAILED" },
                );
                failed++;
            } else {
                // Masih diproses, biarkan
                stillPending++;
            }
        } catch {
            stillPending++;
        }
    }

    return json({ total: pending.length, resolved, stillPending, failed });
};
