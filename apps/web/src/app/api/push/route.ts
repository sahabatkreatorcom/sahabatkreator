import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { env } from "@sahabat-kreator/env/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/push — cek status VAPID dan daftar subscription.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const userId = session?.user?.id;
    if (!userId) return json({ error: "User tidak terotentikasi." }, { status: 401 });

    const subscriptions = await db.query.pushSubscription.findMany({
        where: and(
            eq(schema.pushSubscription.userId, userId),
            eq(schema.pushSubscription.organizationId, activeOrganizationId)
        ),
        columns: { id: true, endpoint: true, userAgent: true, createdAt: true },
        orderBy: desc(schema.pushSubscription.createdAt),
    });

    // VAPID diaktifkan bila key publik + email admin ada di env.
    const isVapidConfigured = Boolean(
        env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_ADMIN_EMAIL,
    );

    return json({
        isSupported: typeof window !== "undefined" && "Notification" in window,
        isVapidConfigured,
        vapidPublicKey: isVapidConfigured ? env.VAPID_PUBLIC_KEY : null,
        subscriptions: subscriptions.map((s) => ({
            id: s.id,
            userAgent: s.userAgent,
            createdAt: s.createdAt.toISOString(),
        })),
    });
});

/**
 * POST /api/push — daftarkan subscription.
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const userId = session?.user?.id;
    if (!userId) return json({ error: "User tidak terotentikasi." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as {
        endpoint: string;
        p256dh: string;
        auth: string;
        userAgent?: string;
    } | null;
    if (!body?.endpoint || !body.p256dh || !body.auth) {
        return json({ error: "Data subscription tidak lengkap." }, { status: 400 });
    }

    // Upsert
    const existing = await db.query.pushSubscription.findFirst({
        where: and(
            eq(schema.pushSubscription.userId, userId),
            eq(schema.pushSubscription.organizationId, activeOrganizationId),
            eq(schema.pushSubscription.endpoint, body.endpoint)
        ),
        columns: { id: true },
    });

    if (existing) {
        await db.update(schema.pushSubscription)
            .set({
                p256dh: body.p256dh,
                auth: body.auth,
                userAgent: body.userAgent ?? null,
            })
            .where(eq(schema.pushSubscription.id, existing.id));
    } else {
        await db.insert(schema.pushSubscription).values({
            id: randomUUID(),
            userId,
            organizationId: activeOrganizationId,
            endpoint: body.endpoint,
            p256dh: body.p256dh,
            auth: body.auth,
            userAgent: body.userAgent ?? null,
        });
    }

    return json({ ok: true });
});

/**
 * DELETE /api/push — hapus subscription.
 * Body: { subscriptionId }
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const userId = session?.user?.id;
    if (!userId) return json({ error: "User tidak terotentikasi." }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { subscriptionId?: string } | null;
    if (!body?.subscriptionId) return json({ error: "subscriptionId wajib." }, { status: 400 });

    await db.delete(schema.pushSubscription)
        .where(
            and(
                eq(schema.pushSubscription.id, body.subscriptionId),
                eq(schema.pushSubscription.userId, userId),
                eq(schema.pushSubscription.organizationId, activeOrganizationId)
            )
        );

    return json({ ok: true });
});
