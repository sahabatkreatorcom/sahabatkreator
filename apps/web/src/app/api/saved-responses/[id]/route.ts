import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { bumpSavedResponseUsage } from "@/lib/inbox-automation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/saved-responses/[id] — ubah balasan.
 * DELETE /api/saved-responses/[id] — hapus balasan.
 * POST /api/saved-responses/[id] — naikkan usageCount (dipanggil saat balasan dipakai di inbox).
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { name?: string; content?: string; shortcut?: string; category?: string } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const existing = await db.query.captionTemplate.findFirst({
        where: and(eq(schema.captionTemplate.id, id), eq(schema.captionTemplate.organizationId, activeOrganizationId)),
        columns: { id: true },
    });
    if (!existing) return json({ error: "Balasan tidak ditemukan." }, { status: 404 });

    const values: Record<string, unknown> = {};
    if (typeof body.name === "string") values.name = body.name.trim();
    if (typeof body.content === "string") values.caption = body.content.trim();
    if (typeof body.category === "string") values.category = body.category?.trim() || null;
    values.updatedAt = new Date();

    await db.update(schema.captionTemplate).set(values).where(eq(schema.captionTemplate.id, id));
    return json({ success: true });
});

export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const result = await db.delete(schema.captionTemplate)
        .where(and(
            eq(schema.captionTemplate.id, id),
            eq(schema.captionTemplate.organizationId, activeOrganizationId),
        ))
        .returning({ id: schema.captionTemplate.id });

    if (!result.length) return json({ error: "Balasan tidak ditemukan." }, { status: 404 });
    return json({ success: true });
});

export const POST = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    await bumpSavedResponseUsage(activeOrganizationId, id);
    return json({ success: true });
});