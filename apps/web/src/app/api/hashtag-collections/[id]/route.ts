import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { updateHashtagCollection, deleteHashtagCollection } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/hashtag-collections/[id] — ubah koleksi.
 * DELETE /api/hashtag-collections/[id] — hapus koleksi.
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { name?: string; hashtags?: string[] } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updateHashtagCollection(activeOrganizationId, id, {
        name: typeof body.name === "string" ? body.name : undefined,
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});

export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const result = await deleteHashtagCollection(activeOrganizationId, id);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});