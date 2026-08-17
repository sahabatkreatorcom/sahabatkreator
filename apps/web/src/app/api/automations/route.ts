import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listAutomations, createAutomation } from "@/lib/inbox-automation";
import type { Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/** GET /api/automations — daftar automation auto-reply. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const automations = await listAutomations(activeOrganizationId);
    return json({ automations });
});

/** POST /api/automations — buat automation. Body: { name, platform, keywords[], message, isActive? } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { name?: string; platform?: Platform; keywords?: string[]; message?: string; isActive?: boolean } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await createAutomation(activeOrganizationId, {
        name: typeof body.name === "string" ? body.name : "",
        platform: body.platform ?? "INSTAGRAM",
        keywords: Array.isArray(body.keywords) ? body.keywords : [],
        message: typeof body.message === "string" ? body.message : "",
        isActive: body.isActive,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ automation: result.automation }, { status: result.status });
});