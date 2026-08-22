import { NextRequest } from "next/server";
import { and, lte, eq, or, isNull } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import type { Platform } from "@/lib/platforms/config";
import { json, verifyCronSecret } from "@/lib/api";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import { notifyTokenExpiring } from "@/lib/push-notification";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/refresh-tokens — proactive token refresh.
 *
 * Cari semua social account yang token-nya akan expired dalam 7 hari
 * (Meta/Threads/IG/FB) atau 3 hari (lainnya), lalu refresh otomatis.
 * Dipanggil tiap hari via cron-job.org.
 */
export const POST = async (req: NextRequest) => {
    if (!verifyCronSecret(req)) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    // Meta (IG/FB/Threads): refresh 7 hari sebelum expiry
    // Lainnya: refresh 3 hari sebelum expiry
    const META_PLATFORMS = ["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "THREADS"];
    const SEVEN_DAYS = 7 * 86_400_000;
    const THREE_DAYS = 3 * 86_400_000;

    // Ambil semua akun yang punya tokenExpiry (termasuk organizationId untuk notifikasi)
    const accounts = await db.query.socialAccount.findMany({
        where: (t, { and: _and, isNotNull: _isNotNull }) =>
            _isNotNull(t.tokenExpiry),
        columns: {
            id: true,
            organizationId: true,
            platform: true,
            name: true,
            accessToken: true,
            refreshToken: true,
            tokenExpiry: true,
        },
    });

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;
    const failures: { id: string; platform: string; name: string; error: string }[] = [];

    for (const account of accounts) {
        const expiry = new Date(account.tokenExpiry!).getTime();
        const threshold = META_PLATFORMS.includes(account.platform) ? SEVEN_DAYS : THREE_DAYS;
        const needsRefresh = expiry < now.getTime() + threshold;

        if (!needsRefresh) {
            skipped++;
            continue;
        }

        try {
            const result = await refreshAccountTokenIfNeeded(
                {
                    id: account.id,
                    platform: account.platform as Platform,
                    accessToken: account.accessToken,
                    refreshToken: account.refreshToken,
                    tokenExpiry: account.tokenExpiry,
                },
                { force: true },
            );

            if (result.refreshed) {
                refreshed++;
            } else if (result.needReconnect) {
                failed++;
                failures.push({
                    id: account.id,
                    platform: account.platform,
                    name: account.name,
                    error: result.error || "Perlu reconnect.",
                });
                // Kirim notifikasi push bahwa token perlu di-refresh
                notifyTokenExpiring({
                    organizationId: account.organizationId,
                    platform: account.platform,
                    accountName: account.name,
                }).catch(console.error);
            } else {
                skipped++;
            }
        } catch {
            failed++;
            failures.push({
                id: account.id,
                platform: account.platform,
                name: account.name,
                error: "Unexpected error during refresh.",
            });
        }
    }

    return json({ total: accounts.length, refreshed, skipped, failed, failures });
};
