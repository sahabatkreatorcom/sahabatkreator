import { desc, eq, and, gte, lt } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/overview — ringkasan nyata untuk halaman Ringkasan.
 * Data 7 hari terakhir: post terjadwal/terbit, engagement rate, followers baru,
 * komentar belum dibalas, inbox, aktivitas terbaru, dan antrean konten.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [posts, accounts, snapshots, comments, mentions, messages, activities, publishedPosts] = await Promise.all([
        db.query.post.findMany({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.status, "SCHEDULED")),
            columns: { id: true, caption: true, platform: true, scheduledAt: true, status: true },
            orderBy: [desc(schema.post.scheduledAt)],
            limit: 8,
        }),
        db.query.socialAccount.findMany({
            where: eq(schema.socialAccount.organizationId, activeOrganizationId),
            columns: { id: true, platform: true },
        }),
        db.query.dailyAnalyticsSnapshot.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _gte(t.date, sevenDaysAgo)),
            columns: { date: true, followers: true, followersChange: true, engagementRate: true },
        }),
        db.query.comment.findMany({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.isReplied, false)),
            columns: { id: true },
        }),
        db.query.mention.findMany({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.isRead, false)),
            columns: { id: true },
        }),
        db.query.directMessage.findMany({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.isRead, false)),
            columns: { id: true, direction: true },
        }),
        db.query.activity.findMany({
            where: eq(schema.activity.organizationId, activeOrganizationId),
            columns: { id: true, action: true, resourceName: true, details: true, userName: true, createdAt: true },
            orderBy: [desc(schema.activity.createdAt)],
            limit: 8,
        }),
        db.query.post.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _eq(t.status, "PUBLISHED"), _gte(t.publishedAt, sevenDaysAgo)),
            columns: { id: true },
        }),
    ]);

    // Followers baru & engagement rate dari snapshot terbaru.
    let newFollowers = 0;
    let latestEngagementRate = 0;
    if (snapshots.length > 0) {
        let latestDate = new Date(0);
        for (const s of snapshots) {
            if (s.date.getTime() >= latestDate.getTime()) {
                latestDate = s.date;
                latestEngagementRate = s.engagementRate;
            }
        }
        // followersChange diakumulasi dari semua snapshot periode.
        newFollowers = snapshots.reduce((acc, s) => acc + (s.followersChange || 0), 0);
    }

    // Engagement rate rata-rata tertimbang followers (hindari double-count akun).
    const followersSum = snapshots.reduce((acc, s) => acc + s.followers, 0);
    const weightedRate = followersSum === 0
        ? latestEngagementRate
        : Math.round(
              (snapshots.reduce((acc, s) => acc + s.engagementRate * s.followers, 0) / followersSum) * 10,
          ) / 10;

    // Post terjadwal hari ini vs besok (untuk label ringkasan).
    const tomorrow = new Date(startOfToday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayScheduled = posts.filter((p) => {
        if (!p.scheduledAt) return false;
        return p.scheduledAt.getTime() >= startOfToday.getTime() && p.scheduledAt.getTime() < tomorrow.getTime();
    });

    // Antrean: gabungkan terjadwal + sudah terbit 7 hari terakhir, urut desc.
    const publishedQueue = await db.query.post.findMany({
        where: (t, { and: _and, eq: _eq, gte: _gte }) =>
            _and(_eq(t.organizationId, activeOrganizationId), _eq(t.status, "PUBLISHED"), _gte(t.publishedAt, sevenDaysAgo)),
        columns: { id: true, caption: true, platform: true, publishedAt: true, status: true, scheduledAt: true },
        orderBy: [desc(schema.post.publishedAt)],
        limit: 8,
    });
    const queue = [
        ...posts.map((p) => ({
            id: p.id,
            platform: p.platform,
            title: p.caption,
            time: p.scheduledAt ? p.scheduledAt : null,
            status: "SCHEDULED",
        })),
        ...publishedQueue.map((p) => ({
            id: p.id,
            platform: p.platform,
            title: p.caption,
            time: p.publishedAt ?? p.scheduledAt,
            status: "PUBLISHED",
        })),
    ]
        .filter((q) => q.time)
        .sort((a, b) => (b.time as Date).getTime() - (a.time as Date).getTime())
        .slice(0, 8);

    const inboundUnreadMessages = messages.filter((m) => m.direction !== "outbound").length;

    return json({
        stats: {
            scheduledPosts: posts.length,
            todayScheduled: todayScheduled.length,
            engagementRate: weightedRate,
            newFollowers,
            accountsConnected: accounts.length,
            published7d: publishedPosts.length,
        },
        inbox: {
            unansweredComments: comments.length,
            unreadMentions: mentions.length,
            unreadMessages: inboundUnreadMessages,
        },
        queue,
        activities: activities.map((a) => ({
            id: a.id,
            action: a.action,
            description: a.resourceName,
            details: a.details,
            userName: a.userName,
            createdAt: a.createdAt,
        })),
    });
});