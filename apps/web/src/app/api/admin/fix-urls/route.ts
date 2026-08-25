import { NextRequest, NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { db, schema } from "@sahabat-kreator/db";
import { eq, isNotNull } from "drizzle-orm";

/**
 * API endpoint untuk memperbaiki external_url, external_id, external_thumbnail_url, dan synced_at.
 * Hanya bisa diakses oleh admin platform.
 *
 * GET  /api/admin/fix-urls?dry-run=true  - Preview perubahan tanpa menyimpan
 * POST /api/admin/fix-urls              - Terapkan perbaikan ke database
 */

interface PostRow {
    id: string;
    platform: string | null;
    platformPostId: string | null;
    externalUrl: string | null;
    externalId: string | null;
    externalThumbnailUrl: string | null;
    syncedAt: Date | null;
    publishedAt: Date | null;
    socialAccountId: string | null;
    status: string;
}

function buildCorrectUrl(platform: string | null, platformPostId: string | null, accountName: string | null, mediaTypes?: string[]): string | null {
    if (!platform || !platformPostId) return null;

    let cleanId = platformPostId;

    // LinkedIn URN: urn:li:share:1234567890 → ambil numeric part
    const urnMatch = platformPostId.match(/share:(\d+)/);
    if (urnMatch) cleanId = urnMatch[1];

    // TikTok ID "completed" atau "tiktok_pending:" prefix tidak valid
    if (platform === "TIKTOK") {
        if (cleanId === "completed") return null;
        if (cleanId.startsWith("tiktok_pending:")) return null;
    }

    switch (platform) {
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE": {
            // Instagram: platformPostId = media ID (numeric), tapi URL pakai shortcode
            // Jika externalUrl sudah punya shortcode yang valid, JANGAN diubah
            // Kita tidak bisa resolve shortcode dari media ID tanpa API call
            return null; // Skip — Instagram URL harus di-handle manual atau via publish flow
        }
        case "TIKTOK": {
            if (!cleanId) return null;
            // Tentukan /photo/ vs /video/ berdasarkan media type
            const hasVideo = mediaTypes?.some((mt) => mt.startsWith("video/")) ?? false;
            return `https://www.tiktok.com/@${accountName ?? "user"}/${hasVideo ? "video" : "photo"}/${cleanId}`;
        }
        case "FACEBOOK":
            return cleanId ? `https://www.facebook.com/${cleanId}` : null;
        case "YOUTUBE":
            return cleanId ? `https://www.youtube.com/watch?v=${cleanId}` : null;
        case "PINTEREST":
            return cleanId ? `https://www.pinterest.com/pin/${cleanId}/` : null;
        case "LINKEDIN":
            return cleanId ? `https://www.linkedin.com/feed/update/urn:li:share:${cleanId}` : null;
        case "THREADS":
            // Note: fix-urls tidak bisa resolve shortcode tanpa API call, gunakan mediaId
            return cleanId ? `https://www.threads.net/@${accountName ?? "user"}/post/${cleanId}` : null;
        default:
            return null;
    }
}

function buildExternalId(platform: string | null, platformPostId: string | null, externalUrl: string | null): string | null {
    if (platformPostId) return platformPostId;
    // Ekstrak dari URL jika ada
    if (externalUrl) {
        const match = externalUrl.match(/\/([a-zA-Z0-9_-]+)$/);
        if (match) return match[1];
    }
    return null;
}

function buildThumbnailUrl(platform: string | null, platformPostId: string | null): string | null {
    if (!platform || !platformPostId) return null;

    // YouTube thumbnail
    if (platform === "YOUTUBE") {
        return `https://img.youtube.com/vi/${platformPostId}/maxresdefault.jpg`;
    }

    return null;
}

async function fetchAccountName(socialAccountId: string | null): Promise<string | null> {
    if (!socialAccountId) return null;
    try {
        const account = await db.query.socialAccount.findFirst({
            where: eq(schema.socialAccount.id, socialAccountId),
            columns: { name: true },
        });
        return account?.name ?? null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dry-run") === "true";

    try {
        const posts = await db.query.post.findMany({
            where: isNotNull(schema.post.platformPostId),
            with: {
                media: {
                    with: { media: { columns: { mimeType: true } } },
                    orderBy: (pm, { asc }) => [asc(pm.order)],
                },
            },
            columns: {
                id: true,
                platform: true,
                platformPostId: true,
                externalUrl: true,
                externalId: true,
                externalThumbnailUrl: true,
                syncedAt: true,
                publishedAt: true,
                socialAccountId: true,
                status: true,
            },
        });

        const fixes: Array<{
            postId: string;
            platform: string | null;
            platformPostId: string | null;
            changes: Array<{ field: string; old: string | null; new: string | null }>;
        }> = [];
        let skipped = 0;

        for (const post of posts) {
            const accountName = await fetchAccountName(post.socialAccountId);
            const mediaTypes = post.media.map((pm) => pm.media.mimeType ?? "");
            const correctUrl = buildCorrectUrl(post.platform, post.platformPostId, accountName, mediaTypes);
            const correctId = buildExternalId(post.platform, post.platformPostId, post.externalUrl);
            const correctThumb = buildThumbnailUrl(post.platform, post.platformPostId);

            const changes: Array<{ field: string; old: string | null; new: string | null }> = [];

            if (correctUrl && post.externalUrl !== correctUrl) {
                changes.push({ field: "externalUrl", old: post.externalUrl, new: correctUrl });
            }
            if (correctId && post.externalId !== correctId) {
                changes.push({ field: "externalId", old: post.externalId, new: correctId });
            }
            if (correctThumb && post.externalThumbnailUrl !== correctThumb) {
                changes.push({ field: "externalThumbnailUrl", old: post.externalThumbnailUrl, new: correctThumb });
            }
            if (!post.syncedAt && post.publishedAt) {
                changes.push({ field: "syncedAt", old: null, new: post.publishedAt.toISOString() });
            }

            if (changes.length > 0) {
                fixes.push({ postId: post.id, platform: post.platform, platformPostId: post.platformPostId, changes });
            } else {
                skipped++;
            }
        }

        return NextResponse.json({
            dryRun,
            total: posts.length,
            skipped,
            needsFix: fixes.length,
            fixes,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || session.user.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const posts = await db.query.post.findMany({
            where: isNotNull(schema.post.platformPostId),
            with: {
                media: {
                    with: { media: { columns: { mimeType: true } } },
                    orderBy: (pm, { asc }) => [asc(pm.order)],
                },
            },
            columns: {
                id: true,
                platform: true,
                platformPostId: true,
                externalUrl: true,
                externalId: true,
                externalThumbnailUrl: true,
                syncedAt: true,
                publishedAt: true,
                socialAccountId: true,
                status: true,
            },
        });

        let fixed = 0;
        let skipped = 0;
        let errors = 0;

        for (const post of posts) {
            try {
                const accountName = await fetchAccountName(post.socialAccountId);
                const mediaTypes = post.media.map((pm) => pm.media.mimeType ?? "");
                const correctUrl = buildCorrectUrl(post.platform, post.platformPostId, accountName, mediaTypes);
                const correctId = buildExternalId(post.platform, post.platformPostId, post.externalUrl);
                const correctThumb = buildThumbnailUrl(post.platform, post.platformPostId);

                const updates: Record<string, unknown> = {};
                let needsUpdate = false;

                if (correctUrl && post.externalUrl !== correctUrl) {
                    updates.externalUrl = correctUrl;
                    needsUpdate = true;
                }
                if (correctId && post.externalId !== correctId) {
                    updates.externalId = correctId;
                    needsUpdate = true;
                }
                if (correctThumb && post.externalThumbnailUrl !== correctThumb) {
                    updates.externalThumbnailUrl = correctThumb;
                    needsUpdate = true;
                }
                if (!post.syncedAt && post.publishedAt) {
                    updates.syncedAt = post.publishedAt;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    updates.updatedAt = new Date();
                    await db.update(schema.post)
                        .set(updates)
                        .where(eq(schema.post.id, post.id));
                    fixed++;
                } else {
                    skipped++;
                }
            } catch {
                errors++;
            }
        }

        return NextResponse.json({ fixed, skipped, errors, total: posts.length });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
