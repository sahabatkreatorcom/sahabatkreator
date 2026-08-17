import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { getSebReport } from "@/lib/seb-advisor";

export const dynamic = "force-dynamic";

/** GET /api/seb/report/[id] — detail laporan + rekomendasi + eksperimen. */
export const GET = withAuth(async (ctx, _req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { id } = await params;
    const report = await getSebReport(activeOrganizationId, id);
    if (!report) return json({ error: "Laporan tidak ditemukan." }, { status: 404 });

    return json({ report });
});