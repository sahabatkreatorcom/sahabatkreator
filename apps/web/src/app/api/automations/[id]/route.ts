import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { updateAutomation, deleteAutomation } from "@/lib/inbox-automation";
import type { Platform } from "@/lib/platforms";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/automations/[id] — ubah automation.
 * DELETE /api/automations/[id] — hapus automation.
 */
export const PATCH = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { name?: string; platform?: Platform; keywords?: string[]; message?: string; isActive?: boolean } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const result = await updateAutomation(activeOrganizationId, id, {
        name: typeof body.name === "string" ? body.name : undefined,
        platform: body.platform,
        keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
        message: typeof body.message === "string" ? body.message : undefined,
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    await logActivity(
        activeOrganizationId,
        "automation.updated",
        { type: "automation", id },
        {},
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );
    return json(result, { status: result.status });
});

export const DELETE = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });
    const { id } = await params;

    const result = await deleteAutomation(activeOrganizationId, id);
    if (result.error) return json({ error: result.error }, { status: result.status });
    await logActivity(
        activeOrganizationId,
        "automation.deleted",
        { type: "automation", id },
        {},
        { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
    );
    return json(result, { status: result.status });
});