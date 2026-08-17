import { NextRequest } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/trends — tren performa workspace.
 * Menggabungkan pertumbuhan metrik per platform (platformAnalytics) dan
 * konten berperforma terbaik (postAnalytics join post).
 * ?days=30&platform= (opsional)
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 7), 90);
    const platform = searchParams.get("platform") ?? undefined;

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [rows, posts, accounts] = await Promise.all([
        db.query.dailyAnalyticsSnapshot.findMany({
            where: (t, { and: _and, eq: _eq, gte: _gte }) =>
                _and(_eq(t.organizationId, activeOrganizationId), _gte(t.date, since)),
            orderBy: [desc(schema.dailyAnalyticsSnapshot.date)],
        }),
        db.query.postAnalytics.findMany({
            with: {
                post: {
                    columns: {
                        id: true,
                        organizationId: true,
                        caption: true,
                        platform: true,
                        publishedAt: true,
                        status: true,
                    },
                },
            },
        }),
        db.query.socialAccount.findMany({
            where: eq(schema.socialAccount.organizationId, activeOrganizationId),
            columns: { id: true, platform: true, name: true, avatar: true, username: true },
        }),
    ]);

    // Grupkan rows per platform, urutkan naik tanggal, hitung delta metrik.
    const byPlatform = new Map<string, typeof rows>();
    for (const r of rows) {
        if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
        byPlatform.get(r.platform)!.push(r);
    }

    const platformTrends = [...byPlatform.entries()].map(([p, list]) => {
        const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
        const latest = sorted[sorted.length - 1];
        const earliest = sorted[0];
        const delta = (current: number, prev: number) => (prev === 0 ? 0 : Math.round(((current - prev) / prev) * 1000) / 10);

        const series = sorted.map((s) => ({
            date: s.date.toISOString().slice(0, 10),
            followers: s.followers,
            impressions: s.impressions,
            reach: s.reach,
            engagementRate: s.engagementRate,
        }));

        const account = accounts.find((a) => a.platform === p);
        return {
            platform: p,
            accountName: account?.name ?? null,
            accountAvatar: account?.avatar ?? null,
            latest: {
                followers: latest.followers,
                impressions: latest.impressions,
                reach: latest.reach,
                engagementRate: latest.engagementRate,
            },
            delta: {
                followers: latest.followers - (earliest.followers || 0),
                followersPct: delta(latest.followers, earliest.followers || 0),
                impressions: latest.impressions - (earliest.impressions || 0),
                impressionsPct: delta(latest.impressions, earliest.impressions || 0),
                reach: latest.reach - (earliest.reach || 0),
                reachPct: delta(latest.reach, earliest.reach || 0),
            },
            series,
        };
    });

    // Top konten: ambil postAnalytics yang post-nya milik org & PUBLISHED,
    // urutkan berdasarkan impressions*0.5 + likes*0.3 + comments*0.2.
    const topPosts = posts
        .filter((pa) => pa.post && pa.post.organizationId === activeOrganizationId && pa.post.status === "PUBLISHED")
        .map((pa) => {
            const score =
                (pa.impressions ?? 0) * 0.5 + (pa.likes ?? 0) * 0.3 + (pa.comments ?? 0) * 0.2;
            return {
                postId: pa.postId,
                caption: pa.post?.caption ?? null,
                platform: pa.post?.platform ?? null,
                publishedAt: pa.post?.publishedAt?.toISOString?.() ?? null,
                impressions: pa.impressions ?? 0,
                likes: pa.likes ?? 0,
                comments: pa.comments ?? 0,
                shares: pa.shares ?? 0,
                saves: pa.saves ?? 0,
                engagementRate: pa.engagementRate ?? 0,
                score,
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

    // Bandingkan engagement rate rata-rata per platform (untuk insight).
    const platformAvg = [...byPlatform.entries()].map(([p, list]) => {
        const avg = list.length === 0 ? 0 : list.reduce((a, s) => a + s.engagementRate, 0) / list.length;
        return { platform: p, avgEngagementRate: Math.round(avg * 10) / 10, samples: list.length };
    });

    return json({ platformTrends, topPosts, platformAvg, days });
});