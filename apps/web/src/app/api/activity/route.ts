import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { listActivityLogs, getActivitySummary } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity — daftar jejak aktivitas org.
 * Query: type (post|media|account|team|settings|organization|automation|comment|all), limit, offset.
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "all";
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const [result, summary] = await Promise.all([
        listActivityLogs(activeOrganizationId, { type }, { limit, offset }),
        getActivitySummary(activeOrganizationId),
    ]);

    return json({ ...result, summary });
});