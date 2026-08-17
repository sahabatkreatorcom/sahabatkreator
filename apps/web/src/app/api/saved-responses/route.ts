import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listSavedResponses, createSavedResponse } from "@/lib/inbox-automation";

export const dynamic = "force-dynamic";

/** GET /api/saved-responses — daftar balasan siap pakai. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const responses = await listSavedResponses(activeOrganizationId);
    return json({ responses });
});

/** POST /api/saved-responses — buat balasan. Body: { name, content, shortcut?, category? } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { name?: string; content?: string; shortcut?: string; category?: string } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await createSavedResponse(activeOrganizationId, {
        name: typeof body.name === "string" ? body.name : "",
        content: typeof body.content === "string" ? body.content : "",
        shortcut: typeof body.shortcut === "string" ? body.shortcut : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ response: result.response }, { status: result.status });
});