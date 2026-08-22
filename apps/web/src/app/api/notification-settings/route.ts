import { NextRequest, NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { db, schema } from "@sahabat-kreator/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAuth } from "@/lib/api";

/**
 * GET    /api/notification-settings  - Ambil pengaturan notifikasi user saat ini
 * PATCH  /api/notification-settings  - Simpan pengaturan notifikasi
 */

export async function GET(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const setting = await db.query.notificationSettings.findFirst({
            where: and(
                eq(schema.notificationSettings.organizationId, ctx.activeOrganizationId!),
                eq(schema.notificationSettings.userId, ctx.session.user.id),
            ),
        });

        return NextResponse.json({
            postPublished: setting?.postPublished ?? true,
            postFailed: setting?.postFailed ?? true,
            postReadyToPublish: setting?.postReadyToPublish ?? true,
            tokenExpiring: setting?.tokenExpiring ?? true,
            weeklyDigest: setting?.weeklyDigest ?? false,
            newComment: setting?.newComment ?? true,
            newDM: setting?.newDM ?? true,
            newMention: setting?.newMention ?? true,
            newReview: setting?.newReview ?? true,
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
        postPublished,
        postFailed,
        postReadyToPublish,
        tokenExpiring,
        weeklyDigest,
        newComment,
        newDM,
        newMention,
        newReview,
    } = body;

    try {
        const existing = await db.query.notificationSettings.findFirst({
            where: and(
                eq(schema.notificationSettings.organizationId, ctx.activeOrganizationId!),
                eq(schema.notificationSettings.userId, ctx.session.user.id),
            ),
        });

        if (existing) {
            await db.update(schema.notificationSettings)
                .set({
                    postPublished: postPublished ?? true,
                    postFailed: postFailed ?? true,
                    postReadyToPublish: postReadyToPublish ?? true,
                    tokenExpiring: tokenExpiring ?? true,
                    weeklyDigest: weeklyDigest ?? false,
                    newComment: newComment ?? true,
                    newDM: newDM ?? true,
                    newMention: newMention ?? true,
                    newReview: newReview ?? true,
                    updatedAt: new Date(),
                })
                .where(eq(schema.notificationSettings.id, existing.id));
        } else {
            await db.insert(schema.notificationSettings).values({
                id: randomUUID(),
                organizationId: ctx.activeOrganizationId!,
                userId: ctx.session.user.id,
                postPublished: postPublished ?? true,
                postFailed: postFailed ?? true,
                postReadyToPublish: postReadyToPublish ?? true,
                tokenExpiring: tokenExpiring ?? true,
                weeklyDigest: weeklyDigest ?? false,
                newComment: newComment ?? true,
                newDM: newDM ?? true,
                newMention: newMention ?? true,
                newReview: newReview ?? true,
            });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
