import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listPillars, createPillar } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

/** GET /api/pillars — daftar pilar konten. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const pillars = await listPillars(activeOrganizationId);
    return json({ pillars });
});

/** POST /api/pillars — buat pilar konten. Body: { name, description?, color?, icon? } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await createPillar(activeOrganizationId, {
        name: typeof body.name === "string" ? body.name : "",
        description: typeof body.description === "string" ? body.description : undefined,
        color: typeof body.color === "string" ? body.color : undefined,
        icon: typeof body.icon === "string" ? body.icon : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ pillar: result.pillar }, { status: result.status });
});