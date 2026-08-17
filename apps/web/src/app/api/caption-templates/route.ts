import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listCaptionTemplates, createCaptionTemplate, type CaptionTemplateInput } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

/** GET /api/caption-templates — daftar template caption. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const templates = await listCaptionTemplates(activeOrganizationId);
    return json({ templates });
});

/** POST /api/caption-templates — buat template. Body: CaptionTemplateInput. */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as CaptionTemplateInput | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await createCaptionTemplate(activeOrganizationId, {
        name: body.name,
        caption: body.caption,
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
        category: typeof body.category === "string" ? body.category : undefined,
        thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : undefined,
        mediaIds: Array.isArray(body.mediaIds) ? body.mediaIds : [],
        platforms: Array.isArray(body.platforms) ? body.platforms : [],
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ template: result.template }, { status: result.status });
});