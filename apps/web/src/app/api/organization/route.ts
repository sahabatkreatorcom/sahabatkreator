import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * GET /api/organization — info workspace + brand voice.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const [org, brandVoice] = await Promise.all([
        db.query.organization.findFirst({
            where: eq(schema.organization.id, activeOrganizationId),
            columns: { id: true, name: true, slug: true, logo: true, timezone: true, accentColor: true, accentColorAlt: true, darkMode: true, aiDraftsEnabled: true, tier: true, subscriptionStatus: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
        }),
        db.query.brandVoice.findFirst({
            where: eq(schema.brandVoice.organizationId, activeOrganizationId),
        }),
    ]);

    if (!org) return json({ error: "Workspace tidak ditemukan." }, { status: 404 });

    return json({
        organization: org,
        brandVoice: brandVoice ? {
            id: brandVoice.id,
            samples: brandVoice.samples ?? [],
            toneProfile: brandVoice.toneProfile ? (() => { try { return JSON.parse(brandVoice.toneProfile as unknown as string); } catch { return null; } })() : null,
            guidelines: brandVoice.guidelines ?? null,
        } : null,
        currentUserId: session?.user?.id ?? null,
    });
});

/**
 * PATCH /api/organization — update settings workspace.
 * Body: { name?, timezone?, accentColor?, accentColorAlt?, darkMode?, aiDraftsEnabled? }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as {
        name?: string;
        timezone?: string;
        accentColor?: string;
        accentColorAlt?: string;
        darkMode?: boolean;
        aiDraftsEnabled?: boolean;
    } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.timezone !== undefined) update.timezone = body.timezone;
    if (body.accentColor !== undefined) update.accentColor = body.accentColor;
    if (body.accentColorAlt !== undefined) update.accentColorAlt = body.accentColorAlt;
    if (body.darkMode !== undefined) update.darkMode = body.darkMode;
    if (body.aiDraftsEnabled !== undefined) update.aiDraftsEnabled = body.aiDraftsEnabled;

    if (Object.keys(update).length === 0) return json({ error: "Tidak ada field yang diubah." }, { status: 400 });

    const [updated] = await db.update(schema.organization)
        .set(update)
        .where(eq(schema.organization.id, activeOrganizationId))
        .returning();

    await logActivity(
        activeOrganizationId,
        "settings.updated",
        { type: "organization", id: activeOrganizationId, name: updated.name },
        { fields: Object.keys(update) },
        { userId: session?.user?.id, userName: session?.user?.name },
    );

    return json({ organization: updated });
});

/**
 * POST /api/organization/brand-voice — simpan brand voice.
 * Body: { samples?, toneProfile?, guidelines? }
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as {
        samples?: string[];
        toneProfile?: Record<string, unknown>;
        guidelines?: string;
    } | null;
    if (!body) return json({ error: "Invalid JSON body." }, { status: 400 });

    const existing = await db.query.brandVoice.findFirst({
        where: eq(schema.brandVoice.organizationId, activeOrganizationId),
        columns: { id: true },
    });

    const values = {
        samples: body.samples ?? [],
        toneProfile: body.toneProfile ? JSON.stringify(body.toneProfile) : null,
        guidelines: body.guidelines ?? null,
    };

    let brandVoice;
    if (existing) {
        [brandVoice] = await db.update(schema.brandVoice)
            .set(values)
            .where(eq(schema.brandVoice.id, existing.id))
            .returning();
    } else {
        [brandVoice] = await db.insert(schema.brandVoice).values({
            id: crypto.randomUUID(),
            organizationId: activeOrganizationId,
            ...values,
        }).returning();
    }

    await logActivity(
        activeOrganizationId,
        "settings.updated",
        { type: "brand_voice", id: brandVoice.id },
        { samples: body.samples, guidelines: body.guidelines?.slice(0, 100) },
        { userId: session?.user?.id, userName: session?.user?.name },
    );

    return json({ brandVoice });
});
