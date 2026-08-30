import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listPillars, createPillar } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const pillars = await listPillars(activeOrganizationId);
    return json({ pillars });
});

export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const body = (await req.json().catch(() => null)) as { name?: string; description?: string; color?: string; icon?: string } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });
    const result = await createPillar(activeOrganizationId, { name: body.name || "", description: body.description, color: body.color, icon: body.icon });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ pillar: result.pillar }, { status: result.status });
});
