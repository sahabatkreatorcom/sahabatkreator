import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { updateCaptionTemplate, deleteCaptionTemplate } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/caption-templates/[id] — ubah template.
 * DELETE /api/caption-templates/[id] — hapus template.
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updateCaptionTemplate(activeOrganizationId, id, {
        name: typeof body.name === "string" ? body.name : undefined,
        caption: typeof body.caption === "string" ? body.caption : undefined,
        hashtags: Array.isArray(body.hashtags) ? (body.hashtags as string[]) : undefined,
        category: typeof body.category === "string" ? body.category : body.category === null ? "" : undefined,
        thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : undefined,
        mediaIds: Array.isArray(body.mediaIds) ? (body.mediaIds as string[]) : undefined,
        platforms: Array.isArray(body.platforms) ? (body.platforms as string[]) : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});

export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const result = await deleteCaptionTemplate(activeOrganizationId, id);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result, { status: result.status });
});