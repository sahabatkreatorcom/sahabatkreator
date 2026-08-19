import { NextRequest } from "next/server";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * POST /api/accounts/refresh — perbarui token akses akun (manual / auto-refresh UI).
 * Body: { accountId }
 * Respons: { success, refreshed, error? }
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { accountId?: string } | null;
    if (!body?.accountId) return json({ error: "Account ID wajib." }, { status: 400 });

    const account = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, body.accountId!), _eq(t.organizationId, activeOrganizationId)),
        columns: { id: true, platform: true, name: true, accessToken: true, refreshToken: true, tokenExpiry: true },
    });
    if (!account) return json({ error: "Akun tidak ditemukan." }, { status: 404 });

    const result = await refreshAccountTokenIfNeeded({
        id: account.id,
        platform: account.platform,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        tokenExpiry: account.tokenExpiry,
    });

    if (result.needReconnect) {
        await logActivity(
            activeOrganizationId,
            "account.refresh_failed",
            { type: "account", id: account.id, name: account.name },
            { platform: account.platform, error: result.error },
            { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
        );
        return json({ success: false, refreshed: false, error: result.error }, { status: 400 });
    }

    if (result.refreshed) {
        await logActivity(
            activeOrganizationId,
            "account.refreshed",
            { type: "account", id: account.id, name: account.name },
            { platform: account.platform },
            { userId: ctx.session.user.id, userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined },
        );
    }

    return json({ success: true, refreshed: result.refreshed, tokenExpiry: result.refreshed ? new Date(Date.now() + 60 * 86_400_000).toISOString() : null });
});

/**
 * GET /api/accounts/refresh — refresh semua akun workspace yang perlu (auto di halaman /connections).
 * Amankah? Ini memberatkan rate limit bila dipanggil sering; dipakai sekali saat halaman dimuat.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const accounts = await db.query.socialAccount.findMany({
        where: (t, { eq: _eq }) => _eq(t.organizationId, activeOrganizationId),
        columns: { id: true, platform: true, name: true, accessToken: true, refreshToken: true, tokenExpiry: true },
    });

    const results: { id: string; refreshed: boolean; error?: string }[] = [];
    for (const account of accounts) {
        const result = await refreshAccountTokenIfNeeded({
            id: account.id,
            platform: account.platform,
            accessToken: account.accessToken,
            refreshToken: account.refreshToken,
            tokenExpiry: account.tokenExpiry,
        });
        if (result.needReconnect) {
            results.push({ id: account.id, refreshed: false, error: result.error });
        } else if (result.refreshed) {
            results.push({ id: account.id, refreshed: true });
        }
    }

    return json({ success: true, results });
});