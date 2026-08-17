import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { createPosts } from "@/lib/posts-service";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/posts — daftar post workspace.
 * Query: status (DRAFT|SCHEDULED|PUBLISHED|all), limit, offset.
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const rawLimit = Number(searchParams.get("limit")) || 20;
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const where = [eq(schema.post.organizationId, activeOrganizationId)];
    if (status && status !== "all") where.push(eq(schema.post.status, status.toUpperCase() as never));

    const [posts, total] = await Promise.all([
        db.query.post.findMany({
            where: and(...where),
            with: {
                socialAccount: { columns: { id: true, platform: true, name: true, avatar: true } },
                media: { with: { media: { columns: { id: true, url: true, thumbnailUrl: true, mimeType: true } } } },
            },
            orderBy: [desc(schema.post.createdAt)],
            limit,
            offset,
        }),
        db.$count(schema.post, and(...where)),
    ]);

    return json({
        posts: posts.map((p) => ({
            id: p.id,
            caption: p.caption,
            status: p.status.toLowerCase(),
            scheduledAt: p.scheduledAt?.toISOString() ?? null,
            publishedAt: p.publishedAt?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
            platform: p.platform,
            account: p.socialAccount
                ? { id: p.socialAccount.id, platform: p.socialAccount.platform, name: p.socialAccount.name, avatar: p.socialAccount.avatar }
                : null,
            media: p.media.map((pm) => ({
                id: pm.media.id,
                url: pm.media.url,
                thumbnailUrl: pm.media.thumbnailUrl,
                type: pm.media.mimeType.startsWith("video/") ? "video" : "image",
            })),
            linkedGroupId: p.linkedGroupId,
        })),
        total,
        limit,
        offset,
    });
});

/**
 * POST /api/posts — buat post (draft / scheduled / auto-publish).
 * Body: { caption, platformAccountIds[], mediaIds[], scheduledAt?, autoPublish?, firstComment?, platformSettings? }
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await createPosts({
        organizationId: activeOrganizationId,
        caption: typeof body.caption === "string" ? body.caption : undefined,
        platformAccountIds: Array.isArray(body.platformAccountIds) ? (body.platformAccountIds as string[]) : [],
        mediaIds: Array.isArray(body.mediaIds) ? (body.mediaIds as string[]) : undefined,
        scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : body.scheduledAt === null ? null : undefined,
        autoPublish: body.autoPublish === true,
        firstComment: typeof body.firstComment === "string" ? body.firstComment : undefined,
        pillarId: typeof body.pillarId === "string" ? body.pillarId : undefined,
        platformSettings:
            body.platformSettings && typeof body.platformSettings === "object"
                ? (body.platformSettings as Record<string, import("@/lib/posts-service").PlatformSettingsInput>)
                : undefined,
    });

    if (result.error) return json({ error: result.error }, { status: result.status });
    const userId = ctx.session.user.id;
    const userName = ctx.session.user.name ?? ctx.session.user.email ?? undefined;
    for (const p of result.posts ?? []) {
        await logActivity(
            activeOrganizationId,
            p.status === "scheduled" ? "post.scheduled" : "post.created",
            { type: "post", id: p.id, name: p.caption.slice(0, 100) },
            { platform: p.platform },
            { userId, userName },
        );
    }
    return json({ posts: result.posts, linkedGroupId: result.linkedGroupId, count: result.count }, { status: result.status });
});