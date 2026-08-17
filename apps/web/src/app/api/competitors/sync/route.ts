import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { syncCompetitor } from "@/lib/competitors";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/competitors/sync?id= — refresh data competitor via Business Discovery. */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return json({ error: "ID competitor wajib." }, { status: 400 });

    const result = await syncCompetitor(activeOrganizationId, id);
    if (!result.synced) {
        const status = result.errorCode === "NOT_FOUND" ? 404 : result.errorCode === "NO_IG_ACCOUNT" ? 400 : 502;
        return json({ error: result.error, synced: false }, { status });
    }

    return json(result, { status: 200 });
});