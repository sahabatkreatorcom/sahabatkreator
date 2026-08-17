import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listCompetitors, addCompetitor, deleteCompetitor } from "@/lib/competitors";
import { logActivity } from "@/lib/activity-log";
import type { Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/** GET /api/competitors — daftar competitor yang dilacak. */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const competitors = await listCompetitors(activeOrganizationId);
    return json({ competitors, total: competitors.length });
});

/** POST /api/competitors — tambah competitor. Body: { platform, username } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { platform?: string; username?: string } | null;
    if (!body?.username?.trim()) return json({ error: "Username wajib." }, { status: 400 });
    const platform = body.platform?.toUpperCase() as Platform;
    if (!platform) return json({ error: "Platform wajib." }, { status: 400 });

    const result = await addCompetitor(activeOrganizationId, { platform, username: body.username });
    if (result.error) return json({ error: result.error }, { status: result.status });

    await logActivity(
        activeOrganizationId,
        "competitor.created",
        { type: "competitor", id: result.competitor!.id, name: `@${result.competitor!.username}` },
        { platform },
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );

    return json({ competitor: result.competitor, warning: result.warning }, { status: 201 });
});

/** DELETE /api/competitors?id= — hapus competitor dari pelacakan. */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return json({ error: "ID competitor wajib." }, { status: 400 });

    const competitor = await listCompetitors(activeOrganizationId);
    const target = competitor.find((c) => c.id === id);
    const result = await deleteCompetitor(activeOrganizationId, id);
    if (!result.ok) return json({ error: result.error }, { status: 404 });

    await logActivity(
        activeOrganizationId,
        "competitor.deleted",
        { type: "competitor", id, name: target ? `@${target.username}` : id },
        {},
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );

    return json({ success: true });
});