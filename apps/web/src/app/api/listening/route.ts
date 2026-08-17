import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import {
    getListeningDashboard,
    runListeningSync,
    detectSentiment,
} from "@/lib/listening";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/listening — dashboard social listening.
 * Menampilkan monitor + hasil, ringkasan sentimen, dan unread count.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const dashboard = await getListeningDashboard(activeOrganizationId);
    return json(dashboard);
});

/**
 * POST /api/listening — buat monitor baru, atau jalankan sinkronisasi.
 * Action "create": { action, name, keywords[], excludedTerms[], platforms[], isActive }
 * Action "sync": { action: "sync" }
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    if (body.action === "sync") {
        const result = await runListeningSync(activeOrganizationId);
        await logActivity(
            activeOrganizationId,
            "listening.synced",
            { type: "listening", id: "sync", name: "sinkronisasi social listening" },
            { monitors: result.monitors, matched: result.matched },
            { userId: session?.user?.id, userName: session?.user?.name },
        );
        return json(result);
    }

    if (body.action !== "create") {
        return json({ error: "action wajib (create|sync)." }, { status: 400 });
    }

    const name = String(body.name ?? "").trim();
    const keywords = Array.isArray(body.keywords)
        ? body.keywords.map((k) => String(k).trim()).filter(Boolean)
        : [];
    const excludedTerms = Array.isArray(body.excludedTerms)
        ? body.excludedTerms.map((k) => String(k).trim()).filter(Boolean)
        : [];
    const platforms = Array.isArray(body.platforms)
        ? body.platforms.map((p) => String(p))
        : [];
    const isActive = body.isActive !== false;

    if (!name) return json({ error: "Nama monitor wajib." }, { status: 400 });
    if (keywords.length === 0) return json({ error: "Minimal satu keyword." }, { status: 400 });

    const monitor = await db.insert(schema.socialListeningMonitor).values({
        id: crypto.randomUUID(),
        organizationId: activeOrganizationId,
        name,
        keywords,
        excludedTerms,
        platforms: platforms as never,
        isActive,
    }).returning();

    await logActivity(
        activeOrganizationId,
        "listening.created",
        { type: "listening_monitor", id: monitor[0].id, name },
        {},
        { userId: session?.user?.id, userName: session?.user?.name }
    );

    return json({ monitor: monitor[0] });
});

/**
 * PATCH /api/listening — tandai hasil terbaca.
 * Body: { ids: string[] }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
    if (!body?.ids || body.ids.length === 0) return json({ error: "ids wajib." }, { status: 400 });

    await db.update(schema.socialListeningItem)
        .set({ isRead: true })
        .where(
            and(
                inArray(schema.socialListeningItem.id, body.ids),
                eq(schema.socialListeningItem.organizationId, activeOrganizationId),
            ),
        );

    return json({ success: true });
});

/**
 * DELETE /api/listening — hapus monitor (dan hasilnya via cascade).
 * ?monitorId=xxx
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const monitorId = searchParams.get("monitorId");
    if (!monitorId) return json({ error: "monitorId wajib." }, { status: 400 });

    await db.delete(schema.socialListeningMonitor)
        .where(
            and(
                eq(schema.socialListeningMonitor.id, monitorId),
                eq(schema.socialListeningMonitor.organizationId, activeOrganizationId),
            ),
        );

    return json({ success: true });
});