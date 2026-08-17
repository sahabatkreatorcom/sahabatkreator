import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { analyzeMediaForSeb, listAnalyzableMedia } from "@/lib/seb-advisor";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** GET /api/seb/media — daftar media yang siap dianalisis (diproses worker). */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const media = await listAnalyzableMedia(activeOrganizationId, limit, offset);
    return json({ media });
});

/** POST /api/seb/media/analyze — analisis visual satu media. */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { mediaId?: string } | null;
    if (!body?.mediaId) return json({ error: "Media ID wajib." }, { status: 400 });

    try {
        const result = await analyzeMediaForSeb(activeOrganizationId, body.mediaId);
        await logActivity(
            activeOrganizationId,
            "seb.media_analyzed",
            { type: "media", id: body.mediaId },
            {},
            { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
        );
        return json({ analysis: result }, { status: 201 });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal menganalisis media.";
        return json({ error: message }, { status: e instanceof Error && /belum dikonfigurasi/.test(message) ? 400 : 422 });
    }
});