import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import { chatWithSeb, listSebSessions, getSebSessionMessages } from "@/lib/seb-advisor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/seb/chat — kirim pesan ke Seb. Body: { message, sessionId? } */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { message?: string; sessionId?: string } | null;
    const message = body?.message?.trim();
    if (!message) return json({ error: "Pesan wajib." }, { status: 400 });
    const sessionId = body?.sessionId;

    try {
        const result = await chatWithSeb({
            organizationId: activeOrganizationId,
            userId: ctx.session.user.id,
            sessionId,
            message,
        });
        return json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Gagal mengirim pesan ke Seb.";
        const isConfigError = /OpenRouter belum dikonfigurasi/.test(msg);
        const isProviderError = /OpenRouter request failed/.test(msg);
        return json({ error: msg }, { status: isConfigError || isProviderError ? 400 : 500 });
    }
});

/** GET /api/seb/chat?sessionId= — riwayat sesi (dengan sessionId) atau daftar sesi. */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
        const session = await getSebSessionMessages(activeOrganizationId, sessionId);
        if (!session) return json({ error: "Sesi tidak ditemukan." }, { status: 404 });
        return json({ session });
    }

    const sessions = await listSebSessions(activeOrganizationId, ctx.session.user.id);
    return json({ sessions });
});