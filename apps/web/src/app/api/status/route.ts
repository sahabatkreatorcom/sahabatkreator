import { NextRequest } from "next/server";
import { desc, eq, and, gte } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/status — status publikasi: postingan, akun, error.
 * ?days=14
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
    const { activeOrganizationId } = _ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days")) ?? 14, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [published, scheduled, failed, accounts, publishErrors, activities] = await Promise.all([
        db.query.post.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.status, "PUBLISHED"), _gte(t.publishedAt, since)),
            columns: { id: true, caption: true, platform: true, status: true, publishedAt: true, externalUrl: true, externalId: true },
            orderBy: [desc(schema.post.publishedAt)],
            limit: 20,
        }),
        db.query.post.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.status, "SCHEDULED"), _gte(t.scheduledAt, since)),
            columns: { id: true, caption: true, platform: true, status: true, scheduledAt: true },
            orderBy: [desc(schema.post.scheduledAt)],
            limit: 20,
        }),
        db.query.post.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.status, "FAILED"), _gte(t.createdAt, since)),
            columns: { id: true, caption: true, platform: true, status: true, createdAt: true },
            orderBy: [desc(schema.post.createdAt)],
            limit: 10,
        }),
        db.query.socialAccount.findMany({
            where: eq(schema.socialAccount.organizationId, activeOrganizationId),
            columns: { id: true, platform: true, name: true, username: true, isActive: true, lastRefreshAt: true, lastRefreshError: true },
        }),
        // publish_error tidak punya organizationId → filter via join ke post.
        db.select({
            id: schema.publishError.id,
            postId: schema.publishError.postId,
            platform: schema.publishError.platform,
            errorHuman: schema.publishError.errorHuman,
            errorCode: schema.publishError.errorCode,
            occurredAt: schema.publishError.occurredAt,
        })
            .from(schema.publishError)
            .innerJoin(schema.post, eq(schema.publishError.postId, schema.post.id))
            .where(and(eq(schema.post.organizationId, activeOrganizationId), gte(schema.publishError.occurredAt, since)))
            .orderBy(desc(schema.publishError.occurredAt))
            .limit(20),
        db.query.activity.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte, like: _like }) =>
                and(
                    _eq(t.organizationId, activeOrganizationId),
                    _gte(t.createdAt, since),
                    _like(t.action, "post.%"),
                ),
            columns: { id: true, action: true, resourceName: true, details: true, createdAt: true },
            orderBy: [desc(schema.activity.createdAt)],
            limit: 20,
        }),
    ]);

    // Aggregate per platform.
    const platformStats = accounts.map((acc) => {
        const recentPosts = published.filter((p) => p.platform === acc.platform);
        return {
            platform: acc.platform,
            accountName: acc.name,
            username: acc.username,
            isActive: acc.isActive ?? true,
            lastSyncedAt: acc.lastRefreshAt?.toISOString?.() ?? null,
            lastError: acc.lastRefreshError,
            postPublished: recentPosts.length,
            postsScheduled: scheduled.filter((p) => p.platform === acc.platform).length,
            postsFailed: failed.filter((p) => p.platform === acc.platform).length,
            hasError: !!acc.lastRefreshError,
        };
    });

    // Count by status across all time for snapshot.
    const [totalPublished, totalScheduled, totalFailed, totalAccounts] = await Promise.all([
        db.$count(schema.post, and(eq(schema.post.organizationId, activeOrganizationId), eq(schema.post.status, "PUBLISHED"))),
        db.$count(schema.post, and(eq(schema.post.organizationId, activeOrganizationId), eq(schema.post.status, "SCHEDULED"))),
        db.$count(schema.post, and(eq(schema.post.organizationId, activeOrganizationId), eq(schema.post.status, "FAILED"))),
        db.$count(schema.socialAccount, eq(schema.socialAccount.organizationId, activeOrganizationId)),
    ]);

    return json({
        platformStats,
        published,
        scheduled,
        failed,
        publishErrors,
        activities,
        snapshot: {
            totalPublished,
            totalScheduled,
            totalFailed,
            totalAccounts,
            days,
        },
    });
});