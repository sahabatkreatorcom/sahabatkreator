import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/notification-settings — ambil pengaturan notifikasi user saat ini.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const userId = session?.user?.id;
    if (!userId) return json({ error: "User tidak terotentikasi." }, { status: 401 });

    const settings = await db.query.notificationSettings.findFirst({
        where: and(
            eq(schema.notificationSettings.organizationId, activeOrganizationId),
            eq(schema.notificationSettings.userId, userId),
        ),
    });

    return json(settings ?? {
        postPublished: true,
        postFailed: true,
        postReadyToPublish: true,
        tokenExpiring: true,
        weeklyDigest: false,
        newComment: true,
        newDM: true,
        newMention: true,
        newReview: true,
    });
});

/**
 * PATCH /api/notification-settings — perbarui pengaturan notifikasi.
 * Body: { postPublished?, postFailed?, tokenExpiring?, weeklyDigest?, newComment?, newDM?, newMention?, newReview? }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const userId = session?.user?.id;
    if (!userId) return json({ error: "User tidak terotentikasi." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
        postPublished?: boolean;
        postFailed?: boolean;
        tokenExpiring?: boolean;
        weeklyDigest?: boolean;
        newComment?: boolean;
        newDM?: boolean;
        newMention?: boolean;
        newReview?: boolean;
    } | null;

    if (!body) return json({ error: "Body tidak valid." }, { status: 400 });

    const existing = await db.query.notificationSettings.findFirst({
        where: and(
            eq(schema.notificationSettings.organizationId, activeOrganizationId),
            eq(schema.notificationSettings.userId, userId),
        ),
        columns: { id: true },
    });

    if (existing) {
        await db.update(schema.notificationSettings)
            .set(body)
            .where(eq(schema.notificationSettings.id, existing.id));
        return json({ ok: true });
    }

    // Upsert: insert baru kalau belum ada
    await db.insert(schema.notificationSettings).values({
        id: randomUUID(),
        organizationId: activeOrganizationId,
        userId,
        ...body,
    });

    return json({ ok: true });
});
