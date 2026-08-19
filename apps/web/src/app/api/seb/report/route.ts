import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listSebReports, generateSebReport } from "@/lib/seb-advisor";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** GET /api/seb/report?limit=&offset= — daftar laporan Seb. */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const result = await listSebReports(activeOrganizationId, limit, offset);
    return json(result);
});

/** POST /api/seb/report — buat laporan baru (manual). */
export const POST = withAuth(async (ctx, _req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    try {
        const report = await generateSebReport({
            organizationId: activeOrganizationId,
            userId: ctx.session.user.id,
            trigger: "MANUAL",
        });
        await logActivity(
            activeOrganizationId,
            "seb.report_generated",
            { type: "report", id: report!.id, name: report!.title.slice(0, 100) },
            {},
            { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
        );
        return json({ report }, { status: 201 });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal membuat laporan Seb.";
        const isConfigError = e instanceof Error && /OpenRouter belum dikonfigurasi/.test(message);
        const isProviderError = e instanceof Error && /OpenRouter request failed/.test(message);
        return json({ error: message }, { status: isConfigError || isProviderError ? 400 : 500 });
    }
});