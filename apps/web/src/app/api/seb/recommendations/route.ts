import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listSebRecommendations, updateSebRecommendation } from "@/lib/seb-advisor";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/** GET /api/seb/recommendations?status=&limit=&offset= — daftar rekomendasi. */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "ALL";
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const result = await listSebRecommendations(activeOrganizationId, status, limit, offset);
    return json(result);
});

/** PATCH /api/seb/recommendations — { id, status?, dueAt? } ubah status/due date. */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { id?: string; status?: string; dueAt?: string | null } | null;
    if (!body?.id) return json({ error: "ID rekomendasi wajib." }, { status: 400 });

    const result = await updateSebRecommendation(activeOrganizationId, body.id, {
        status: body.status,
        dueAt: body.dueAt,
    });
    if (!result.ok) return json({ error: result.error }, { status: 404 });

    await logActivity(
        activeOrganizationId,
        "seb.recommendation_updated",
        { type: "recommendation", id: body.id },
        { status: body.status },
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );
    return json({ success: true });
});