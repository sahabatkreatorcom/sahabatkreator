import { NextRequest } from "next/server";
import { requireAuth, json, verifyCronSecret } from "@/lib/api";
import { syncOrganizationComments } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/inbox/sync — sinkronkan komentar semua post PUBLISHED di workspace.
 * Bisa dipanggil dari UI (terautentikasi) atau cron (Bearer CRON_SECRET).
 */
export async function POST(req: NextRequest) {
    // Jalur cron: tanpa sesi, wajib Bearer CRON_SECRET + header x-organization-id.
    if (verifyCronSecret(req)) {
        const orgId = req.headers.get("x-organization-id");
        if (!orgId) return json({ error: "x-organization-id wajib untuk panggilan cron." }, { status: 400 });
        const result = await syncOrganizationComments(orgId);
        return json(result);
    }

    // Jalur UI: sesi user aktif.
    const ctx = await requireAuth();
    if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });
    if (!ctx.activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const result = await syncOrganizationComments(ctx.activeOrganizationId);
    return json(result);
}