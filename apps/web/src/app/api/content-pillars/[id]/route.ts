import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { updatePillar, deletePillar } from "@/lib/content-tools";

export const dynamic = "force-dynamic";

export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return json({ error: "ID pilar diperlukan." }, { status: 400 });
    const body = (await req.json().catch(() => null)) as { name?: string; description?: string; color?: string; icon?: string } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });
    const result = await updatePillar(activeOrganizationId, id, body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ ok: true });
});

export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return json({ error: "ID pilar diperlukan." }, { status: 400 });
    const result = await deletePillar(activeOrganizationId, id);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json({ ok: true });
});
