import { randomUUID } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { and, eq, lt, or } from "drizzle-orm";
import { fetchAccountMetrics } from "./metrics";
import { decryptToken } from "@/lib/token-encryption";
import { PLATFORM_STORAGE_POLICIES, getPlatformStoragePolicy } from "./policy";

type Platform = (typeof schema.platformEnum.enumValues)[number];

export interface SyncResult {
    checked: number;
    synced: number;
    failed: number;
    skippedByPolicy: number;
    purged: number;
    errors: { accountId: string; platform: string; error: string }[];
}

/**
 * Sinkronkan metrik akun untuk satu org.
 *
 * Kebijakan penyimpanan berbasis dokumentasi resmi tiap platform (policy.ts):
 * platform yang melarang penyimpanan (mis. Pinterest) tidak pernah ditulis ke
 * DB. Data yang melebihi batas retensi (mis. LinkedIn 1 tahun) dihapus.
 */
export async function syncOrganizationAnalytics(organizationId: string): Promise<SyncResult> {
    const accounts = await db.query.socialAccount.findMany({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.isActive, true)),
        columns: { id: true, platform: true, accessToken: true },
    });

    const result: SyncResult = { checked: accounts.length, synced: 0, failed: 0, skippedByPolicy: 0, purged: 0, errors: [] };

    if (accounts.length === 0) return result;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Akumulasi per platform untuk snapshot harian (hanya platform yang policy ALLOWED)
    const platformTotals = new Map<
        Platform,
        { followers: number; followersChange: number; impressions: number; reach: number; engagementRate: number }
    >();

    for (const account of accounts) {
        const policy = getPlatformStoragePolicy(account.platform);

        try {
            const metrics = await fetchAccountMetrics(account.platform, decryptToken(account.accessToken));
            if (!metrics) {
                result.failed++;
                result.errors.push({ accountId: account.id, platform: account.platform, error: "Metrik tidak tersedia / belum didukung." });
                continue;
            }

            if (policy.storage === "NOT_ALLOWED") {
                result.skippedByPolicy++;
                continue;
            }

            // Simpan ke platform_analytics
            const existing = await db.query.platformAnalytics.findFirst({
                where: (t, { and: _and, eq: _eq }) =>
                    _and(_eq(t.socialAccountId, account.id), _eq(t.date, today)),
                columns: { id: true },
            });

            const values = {
                followers: metrics.followers,
                followersChange: metrics.followersChange,
                following: metrics.following,
                impressions: metrics.impressions,
                reach: metrics.reach,
                engagementRate: metrics.engagementRate,
                profileViews: metrics.profileViews,
                websiteClicks: metrics.websiteClicks,
                emailClicks: metrics.emailClicks,
                platformMetrics: metrics.platformMetrics,
                syncedAt: new Date(),
            };

            if (existing) {
                await db.update(schema.platformAnalytics).set(values).where(eq(schema.platformAnalytics.id, existing.id));
            } else {
                await db.insert(schema.platformAnalytics).values({
                    id: randomUUID(),
                    organizationId,
                    socialAccountId: account.id,
                    date: today,
                    ...values,
                });
            }

            // Akumulasi untuk snapshot harian
            const cur = platformTotals.get(account.platform) ?? { followers: 0, followersChange: 0, impressions: 0, reach: 0, engagementRate: 0 };
            cur.followers += metrics.followers;
            cur.followersChange += metrics.followersChange;
            cur.impressions += metrics.impressions;
            cur.reach += metrics.reach;
            cur.engagementRate += metrics.engagementRate;
            platformTotals.set(account.platform, cur);

            result.synced++;
        } catch (error) {
            result.failed++;
            result.errors.push({
                accountId: account.id,
                platform: account.platform,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    if (platformTotals.size > 0) {
        await upsertDailySnapshot(organizationId, platformTotals);
    }

    result.purged = await purgeExpiredAnalytics(organizationId);

    return result;
}

/**
 * Hapus snapshot yang melebihi batas retensi per platform (mis. LinkedIn 1 tahun).
 * Dipanggil setiap sinkronisasi supaya data yang sudah lewat masa simpan
 * dibuang sesuai kebijakan platform.
 */
async function purgeExpiredAnalytics(organizationId: string): Promise<number> {
    let purged = 0;

    for (const [key, policy] of Object.entries(PLATFORM_STORAGE_POLICIES)) {
        if (!policy.retentionDays) continue;
        const platform = key as Platform;

        const cutoff = new Date();
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setDate(cutoff.getDate() - policy.retentionDays);

        // platform_analytics dipecah per akun — cari akun org di platform tsb.
        const accounts = await db.query.socialAccount.findMany({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, organizationId), _eq(t.platform, platform)),
            columns: { id: true },
        });
        if (accounts.length === 0) continue;

        const accountIds = accounts.map((a) => a.id);
        const accountConds = or(...accountIds.map((id) => eq(schema.platformAnalytics.socialAccountId, id)));
        if (!accountConds) continue;

        const stale = await db.query.platformAnalytics.findMany({
            where: (t, { and: _and, lt: _lt }) => _and(accountConds, _lt(t.date, cutoff)),
            columns: { id: true },
        });
        if (stale.length > 0) {
            const ids = stale.map((s) => s.id);
            await db.delete(schema.platformAnalytics).where(or(...ids.map((id) => eq(schema.platformAnalytics.id, id))));
            purged += ids.length;
        }

        // Snapshot harian per-org per-platform.
        const staleSnap = await db.query.dailyAnalyticsSnapshot.findMany({
            where: (t, { and: _and, eq: _eq, lt: _lt }) =>
                _and(_eq(t.organizationId, organizationId), _eq(t.platform, platform), _lt(t.date, cutoff)),
            columns: { id: true },
        });
        if (staleSnap.length > 0) {
            const ids = staleSnap.map((s) => s.id);
            await db.delete(schema.dailyAnalyticsSnapshot).where(or(...ids.map((id) => eq(schema.dailyAnalyticsSnapshot.id, id))));
            purged += ids.length;
        }
    }

    return purged;
}

/** Gabungkan metrik per platform → daily_analytics_snapshot (hanya platform consent). */
async function upsertDailySnapshot(
    organizationId: string,
    platformTotals: Map<Platform, { followers: number; followersChange: number; impressions: number; reach: number; engagementRate: number }>,
): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const publishedToday = await db.query.post.findMany({
        where: (t, { and: _and, eq: _eq, gte: _gte }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.status, "PUBLISHED"), _gte(t.publishedAt, today)),
        columns: { platform: true },
    });
    const publishedCount = new Map<Platform, number>();
    for (const p of publishedToday) {
        if (!p.platform) continue;
        publishedCount.set(p.platform, (publishedCount.get(p.platform) ?? 0) + 1);
    }

    for (const [platform, totals] of platformTotals) {
        const existing = await db.query.dailyAnalyticsSnapshot.findFirst({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.organizationId, organizationId), _eq(t.platform, platform), _eq(t.date, today)),
            columns: { id: true },
        });

        const values = {
            followers: totals.followers,
            followersChange: totals.followersChange,
            impressions: totals.impressions,
            reach: totals.reach,
            engagementRate: totals.engagementRate,
            postsPublished: publishedCount.get(platform) ?? 0,
            syncedAt: new Date(),
        };

        if (existing) {
            await db.update(schema.dailyAnalyticsSnapshot).set(values).where(eq(schema.dailyAnalyticsSnapshot.id, existing.id));
        } else {
            await db.insert(schema.dailyAnalyticsSnapshot).values({
                id: randomUUID(),
                organizationId,
                platform,
                date: today,
                ...values,
            });
        }
    }
}

export { and };