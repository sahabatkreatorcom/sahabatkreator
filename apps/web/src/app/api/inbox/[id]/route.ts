import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { replyToComment } from "@/lib/inbox";
import { decryptToken } from "@/lib/token-encryption";

export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/[id]/reply — balas komentar di platform.
 * Body: { text: string }
 */
export const POST = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { text?: string } | null;
    const text = body?.text?.trim();
    if (!text) return json({ error: "Teks balasan wajib." }, { status: 400 });

    const comment = await db.query.comment.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.id, id), _eq(t.organizationId, activeOrganizationId)),
        with: { socialAccount: true },
    });

    if (!comment || !comment.socialAccount || !comment.platformPostId) {
        return json({ error: "Komentar tidak ditemukan." }, { status: 404 });
    }

    const account = comment.socialAccount;
    const result = await replyToComment(
        {
            id: account.id,
            organizationId: account.organizationId,
            platform: account.platform,
            accessToken: decryptToken(account.accessToken),
        },
        comment.platformPostId,
        comment.platformCommentId,
        text,
    );

    if (!result.success) {
        return json({ error: result.error || "Gagal membalas." }, { status: 500 });
    }

    // Simpan balasan sebagai komentar sendiri (penanda sudah dibalas).
    await db.insert(schema.comment).values({
        id: crypto.randomUUID(),
        organizationId: activeOrganizationId,
        socialAccountId: account.id,
        postId: comment.postId,
        platformPostId: comment.platformPostId,
        platformCommentId: result.platformCommentId ?? "",
        authorId: "SELF",
        authorUsername: account.name || account.username || "Saya",
        authorAvatar: account.avatar ?? null,
        text,
        parentId: comment.id,
        isRead: true,
        isReplied: false,
        isHidden: false,
        createdAt: new Date(),
        syncedAt: new Date(),
    });

    await db.update(schema.comment)
        .set({ isReplied: true, replyCount: (comment.replyCount ?? 0) + 1 })
        .where(and(eq(schema.comment.id, id), eq(schema.comment.organizationId, activeOrganizationId)));

    return json({ success: true, id: result.platformCommentId });
});

/**
 * PATCH /api/inbox/[id] — ubah isRead / isReplied / isHidden.
 * Body: { isRead?: boolean, isReplied?: boolean, isHidden?: boolean }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { isRead?: boolean; isReplied?: boolean; isHidden?: boolean } | null;
    const updates: { isRead?: boolean; isReplied?: boolean; isHidden?: boolean } = {};
    if (typeof body?.isRead === "boolean") updates.isRead = body.isRead;
    if (typeof body?.isReplied === "boolean") updates.isReplied = body.isReplied;
    if (typeof body?.isHidden === "boolean") updates.isHidden = body.isHidden;

    if (Object.keys(updates).length === 0) return json({ error: "Tidak ada perubahan." }, { status: 400 });

    await db.update(schema.comment)
        .set(updates)
        .where(and(eq(schema.comment.id, id), eq(schema.comment.organizationId, activeOrganizationId)));

    return json({ success: true });
});

/**
 * DELETE /api/inbox/[id] — hapus komentar dari inbox (lokal, tanpa menghapus di platform).
 */
export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    await db.delete(schema.comment).where(and(eq(schema.comment.id, id), eq(schema.comment.organizationId, activeOrganizationId)));
    return json({ success: true });
});