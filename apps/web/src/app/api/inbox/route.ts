import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/inbox — daftar komentar workspace.
 * Filter: platform, isRead, isReplied, q (cari author/text), limit (default 50).
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform");
    const isRead = searchParams.get("isRead");
    const isReplied = searchParams.get("isReplied");
    const q = searchParams.get("q");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const comments = await db.query.comment.findMany({
        where: (t, { and: _and, eq: _eq }) => {
            const conds = [_eq(t.organizationId, activeOrganizationId)];
            if (isRead !== null && isRead !== undefined) conds.push(_eq(t.isRead, isRead === "true"));
            if (isReplied !== null && isReplied !== undefined) conds.push(_eq(t.isReplied, isReplied === "true"));
            return _and(...conds);
        },
        with: {
            socialAccount: { columns: { id: true, platform: true, name: true, avatar: true, username: true } },
            post: { columns: { id: true, caption: true, platformPostId: true } },
        },
        orderBy: [desc(schema.comment.createdAt)],
        limit,
        offset,
    });

    // Transform socialAccount -> account untuk frontend
    const transformed = comments.map((c) => ({
        ...c,
        account: c.socialAccount,
    }));

    // Filter platform & pencarian teks — dilakukan di memori karena kueri
    // relasional drizzle belum punya contains bawaan yang sederhana.
    let filtered = transformed;
    if (platform) {
        filtered = filtered.filter((c) => c.account?.platform === platform);
    }
    if (q) {
        const needle = q.toLowerCase();
        filtered = filtered.filter(
            (c) => c.text.toLowerCase().includes(needle) || c.authorUsername.toLowerCase().includes(needle),
        );
    }

    const unread = await db.query.comment.findMany({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, activeOrganizationId), _eq(t.isRead, false)),
        columns: { id: true },
    });

    return json({
        comments: filtered,
        unreadCount: unread.length,
    });
});

/**
 * PATCH /api/inbox — tandai komentar terbaca/dibalas.
 * Body: { ids: string[], isRead?: boolean, isReplied?: boolean }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { ids?: string[]; isRead?: boolean; isReplied?: boolean } | null;
    if (!body?.ids || body.ids.length === 0) return json({ error: "ids wajib." }, { status: 400 });

    const updates: { isRead?: boolean; isReplied?: boolean } = {};
    if (typeof body.isRead === "boolean") updates.isRead = body.isRead;
    if (typeof body.isReplied === "boolean") updates.isReplied = body.isReplied;

    if (Object.keys(updates).length > 0) {
        await Promise.all(
            body.ids.map((id) =>
                db.update(schema.comment)
                    .set(updates)
                    .where(and(eq(schema.comment.id, id), eq(schema.comment.organizationId, activeOrganizationId))),
            ),
        );
    }

    return json({ success: true });
});

/**
 * DELETE /api/inbox — hapus komentar dari inbox.
 * Body: { ids: string[] }
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
    if (!body?.ids || body.ids.length === 0) return json({ error: "ids wajib." }, { status: 400 });

    await Promise.all(
        body.ids.map((id) =>
            db.delete(schema.comment).where(and(eq(schema.comment.id, id), eq(schema.comment.organizationId, activeOrganizationId))),
        ),
    );

    return json({ success: true });
});