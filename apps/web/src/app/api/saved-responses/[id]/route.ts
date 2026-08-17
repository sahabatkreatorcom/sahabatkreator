import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { updateSavedResponse, deleteSavedResponse, bumpSavedResponseUsage } from "@/lib/inbox-automation";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/saved-responses/[id] — ubah balasan.
 * DELETE /api/saved-responses/[id] — hapus balasan.
 * POST /api/saved-responses/[id]/use — naikkan usageCount (dipanggil saat balasan dipakai di inbox).
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { name?: string; content?: string; shortcut?: string; category?: string } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updateSavedResponse(activeOrganizationId, id, {
        name: typeof body.name === "string" ? body.name : undefined,
        content: typeof body.content === "string" ? body.content : undefined,
        shortcut: body.shortcut === null ? "" : typeof body.shortcut === "string" ? body.shortcut : undefined,
        category: body.category === null ? "" : typeof body.category === "string" ? body.category : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});

export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const result = await deleteSavedResponse(activeOrganizationId, id);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});

export const POST = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    await bumpSavedResponseUsage(activeOrganizationId, id);
    return json({ success: true });
});