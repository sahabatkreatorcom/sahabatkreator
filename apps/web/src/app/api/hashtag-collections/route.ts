import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listHashtagCollections, createHashtagCollection } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

/** GET /api/hashtag-collections — daftar koleksi hashtag. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const collections = await listHashtagCollections(activeOrganizationId);
    return json({ collections });
});

/** POST /api/hashtag-collections — buat koleksi. Body: { name, hashtags[] } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { name?: string; hashtags?: string[] } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await createHashtagCollection(activeOrganizationId, {
        name: typeof body.name === "string" ? body.name : "",
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ collection: result.collection }, { status: result.status });
});