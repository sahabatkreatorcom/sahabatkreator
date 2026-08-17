import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { updatePost, deletePost } from "@/lib/posts-service";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[id] — detail satu post.
 */
export const GET = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { id } = await params;

    const post = await db.query.post.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, activeOrganizationId)),
        with: {
            socialAccount: { columns: { id: true, platform: true, name: true, avatar: true } },
            media: { with: { media: { columns: { id: true, url: true, thumbnailUrl: true, mimeType: true } } } },
        },
    });
    if (!post) return json({ error: "Post tidak ditemukan." }, { status: 404 });

    return json({
        id: post.id,
        caption: post.caption,
        status: post.status.toLowerCase(),
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt: post.createdAt.toISOString(),
        platform: post.platform,
        account: post.socialAccount,
        media: post.media.map((pm) => ({
            id: pm.media.id,
            url: pm.media.url,
            thumbnailUrl: pm.media.thumbnailUrl,
            type: pm.media.mimeType.startsWith("video/") ? "video" : "image",
        })),
        linkedGroupId: post.linkedGroupId,
    });
});

/**
 * PATCH /api/posts/[id] — perbarui caption/jadwal/dll (hanya belum terbit).
 * Body: { caption?, scheduledAt?, autoPublish?, firstComment?, postType? }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updatePost(activeOrganizationId, id, {
        caption: typeof body.caption === "string" ? body.caption : undefined,
        scheduledAt: typeof body.scheduledAt === "string" ? body.scheduledAt : body.scheduledAt === null ? null : undefined,
        autoPublish: typeof body.autoPublish === "boolean" ? body.autoPublish : undefined,
        firstComment: typeof body.firstComment === "string" ? body.firstComment : body.firstComment === null ? null : undefined,
        postType: typeof body.postType === "string" ? body.postType : undefined,
    });

    if (!result.ok) return json({ error: result.error }, { status: 400 });
    await logActivity(
        activeOrganizationId,
        "post.updated",
        { type: "post", id },
        {},
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );
    return json({ success: true });
});

/**
 * DELETE /api/posts/[id] — hapus post (hanya belum terbit).
 */
export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { id } = await params;
    const result = await deletePost(activeOrganizationId, id);
    if (!result.ok) return json({ error: result.error }, { status: 400 });

    // Bersihkan relasi terkait
    await db.delete(schema.postMedia).where(eq(schema.postMedia.postId, id));
    await db.delete(schema.publishError).where(eq(schema.publishError.postId, id));

    await logActivity(
        activeOrganizationId,
        "post.deleted",
        { type: "post", id },
        {},
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );
    return json({ success: true });
});