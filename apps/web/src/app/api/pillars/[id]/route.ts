import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { updatePillar, deletePillar } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/pillars/[id] — ubah pilar.
 * DELETE /api/pillars/[id] — hapus pilar.
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updatePillar(activeOrganizationId, id, {
        name: typeof body.name === "string" ? body.name : undefined,
        description: body.description === null ? null : typeof body.description === "string" ? body.description : undefined,
        color: typeof body.color === "string" ? body.color : undefined,
        icon: body.icon === null ? null : typeof body.icon === "string" ? body.icon : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});

export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const result = await deletePillar(activeOrganizationId, id);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});