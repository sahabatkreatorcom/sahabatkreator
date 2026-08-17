import { NextRequest } from "next/server";
import { env } from "@sahabat-kreator/env/server";
import { requireAuth, json } from "@/lib/api";
import { syncOrganizationAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/analytics/sync — sinkronkan metrik akun org sekarang.
 * Bisa dipanggil dari UI (terautentikasi) atau cron (Bearer CRON_SECRET).
 */
export async function POST(req: NextRequest) {
    // Jalur cron: tanpa sesi, wajib Bearer CRON_SECRET + header x-organization-id.
    const auth = req.headers.get("authorization");
    if (auth === `Bearer ${env.CRON_SECRET}`) {
        const orgId = req.headers.get("x-organization-id");
        if (!orgId) return json({ error: "x-organization-id wajib untuk panggilan cron." }, { status: 400 });
        const result = await syncOrganizationAnalytics(orgId);
        return json(result);
    }

    // Jalur UI: sesi user aktif.
    const ctx = await requireAuth();
    if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });
    if (!ctx.activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const result = await syncOrganizationAnalytics(ctx.activeOrganizationId);
    return json(result);
}