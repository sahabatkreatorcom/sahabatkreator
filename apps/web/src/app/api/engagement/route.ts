import { NextRequest } from "next/server";
import { withAuth, json } from "@/lib/api";
import {
    getEngagementSummary,
    listMentions,
    listDirectMessages,
    listReviews,
    markEngagementRead,
} from "@/lib/engagement";

export const dynamic = "force-dynamic";

const TYPES = ["mentions", "messages", "reviews"] as const;
type EngagementType = (typeof TYPES)[number];

/**
 * GET /api/engagement — hub engagement workspace.
 * ?type=summary|mentions|messages|reviews&unreadOnly=&platform=&limit=&offset=
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "summary") as EngagementType | string;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const platform = searchParams.get("platform") ?? undefined;
    const limit = Number(searchParams.get("limit")) || 50;
    const offset = Number(searchParams.get("offset")) || 0;

    if (type === "summary") {
        const summary = await getEngagementSummary(activeOrganizationId);
        return json({ summary });
    }

    if (!TYPES.includes(type as EngagementType)) {
        return json({ error: "Tipe tidak dikenal. Gunakan: summary, mentions, messages, reviews." }, { status: 400 });
    }

    const opts = { limit, offset, unreadOnly, platform };
    if (type === "mentions") {
        const [items, summary] = await Promise.all([
            listMentions(activeOrganizationId, opts),
            getEngagementSummary(activeOrganizationId),
        ]);
        return json({ items, summary });
    }
    if (type === "messages") {
        const [items, summary] = await Promise.all([
            listDirectMessages(activeOrganizationId, opts),
            getEngagementSummary(activeOrganizationId),
        ]);
        return json({ items, summary });
    }
    const [items, summary] = await Promise.all([
        listReviews(activeOrganizationId, opts),
        getEngagementSummary(activeOrganizationId),
    ]);
    return json({ items, summary });
});

/**
 * PATCH /api/engagement — tandai item engagement terbaca/belum.
 * Body: { type: "mentions"|"messages"|"reviews", ids: string[], isRead?: boolean }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as
        | { type?: EngagementType; ids?: string[]; isRead?: boolean }
        | null;
    if (!body?.type || !TYPES.includes(body.type)) return json({ error: "type wajib." }, { status: 400 });
    if (!body.ids || body.ids.length === 0) return json({ error: "ids wajib." }, { status: 400 });

    await markEngagementRead(activeOrganizationId, body.type, body.ids, body.isRead ?? true);
    return json({ success: true });
});
