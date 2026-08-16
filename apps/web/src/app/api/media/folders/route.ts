import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/media/folders
 * Daftar folder workspace + hitungan media per folder.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const folders = await db.query.mediaFolder.findMany({
        where: (t, { eq: _eq }) => _eq(t.organizationId, activeOrganizationId),
        orderBy: (t, { asc }) => [asc(t.name)],
    });

    const counts = await db
        .select({ folderId: schema.media.folderId, count: sql<number>`count(*)` })
        .from(schema.media)
        .where(eq(schema.media.organizationId, activeOrganizationId))
        .groupBy(schema.media.folderId);

    const countMap = new Map(counts.map((c) => [c.folderId, Number(c.count)]));
    const unfiledCount = countMap.get(null) ?? 0;
    const totalMediaCount = counts.reduce((sum, c) => sum + Number(c.count), 0);

    return json({
        folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            color: f.color,
            mediaCount: countMap.get(f.id) ?? 0,
            createdAt: f.createdAt.toISOString(),
        })),
        unfiledCount,
        totalMediaCount,
    });
});

/**
 * POST /api/media/folders — buat folder. Body: { name, color? }
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { name?: string; color?: string } | null;
    if (!body) return json({ error: "Body tidak valid." }, { status: 400 });
    const name = body.name?.trim();
    if (!name) return json({ error: "Nama folder wajib." }, { status: 400 });

    const existing = await db.query.mediaFolder.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.name, name), _eq(t.organizationId, activeOrganizationId)),
        columns: { id: true },
    });
    if (existing) return json({ error: "Folder dengan nama ini sudah ada." }, { status: 409 });

    const folder = await db.insert(schema.mediaFolder)
        .values({
            id: randomUUID(),
            organizationId: activeOrganizationId,
            name,
            color: body.color || "#6B7280",
        })
        .returning();

    return json(
        { id: folder[0].id, name: folder[0].name, color: folder[0].color, mediaCount: 0, createdAt: folder[0].createdAt.toISOString() },
        { status: 201 }
    );
});

/**
 * PUT /api/media/folders — ubah folder. Body: { id, name?, color? }
 */
export const PUT = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { id?: string; name?: string; color?: string } | null;
    if (!body?.id) return json({ error: "Folder ID wajib." }, { status: 400 });

    const existing = await db.query.mediaFolder.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, body.id!), _eq(t.organizationId, activeOrganizationId)),
        columns: { id: true, name: true },
    });
    if (!existing) return json({ error: "Folder tidak ditemukan." }, { status: 404 });

    if (body.name && body.name.trim() !== existing.name) {
        const conflict = await db.query.mediaFolder.findFirst({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.name, body.name!.trim()), _eq(t.organizationId, activeOrganizationId)),
            columns: { id: true },
        });
        if (conflict) return json({ error: "Folder dengan nama ini sudah ada." }, { status: 409 });
    }

    const updated = await db.update(schema.mediaFolder)
        .set({
            ...(body.name?.trim() ? { name: body.name.trim() } : {}),
            ...(body.color ? { color: body.color } : {}),
        })
        .where(eq(schema.mediaFolder.id, body.id))
        .returning();

    return json({
        id: updated[0].id,
        name: updated[0].name,
        color: updated[0].color,
        createdAt: updated[0].createdAt.toISOString(),
    });
});

/**
 * DELETE /api/media/folders — hapus folder (media pindah ke root).
 * Body: { id }
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    if (!body?.id) return json({ error: "Folder ID wajib." }, { status: 400 });

    const existing = await db.query.mediaFolder.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, body.id!), _eq(t.organizationId, activeOrganizationId)),
        columns: { id: true },
    });
    if (!existing) return json({ error: "Folder tidak ditemukan." }, { status: 404 });

    await db.delete(schema.mediaFolder).where(
        and(eq(schema.mediaFolder.id, body.id), eq(schema.mediaFolder.organizationId, activeOrganizationId)),
    );

    return json({ success: true });
});