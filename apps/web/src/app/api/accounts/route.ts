import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { env } from "@sahabat-kreator/env/server";
import { withAuth, json } from "@/lib/api";
import { getAuthorizationUrl, getCredentialsForPlatform, CONNECTABLE_PLATFORMS, type Platform } from "@/lib/platforms";

export const dynamic = "force-dynamic";

/**
 * GET /api/accounts — daftar akun sosial yang terhubung di workspace.
 */
export const GET = withAuth(async (ctx) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const accounts = await db.query.socialAccount.findMany({
        where: (t, { eq: _eq }) => _eq(t.organizationId, activeOrganizationId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return json({
        accounts: accounts.map((a) => ({
            id: a.id,
            platform: a.platform,
            name: a.name,
            username: a.username,
            avatar: a.avatar,
            tokenExpiry: a.tokenExpiry?.toISOString() ?? null,
            lastRefreshError: a.lastRefreshError ? "Perlu perhatian — token mungkin bermasalah." : null,
            isActive: a.isActive,
            createdAt: a.createdAt.toISOString(),
        })),
    });
});

/**
 * POST /api/accounts — mulai alur OAuth untuk platform.
 * Body: { platform }
 * Mengembalikan { authUrl, state }.
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { platform?: string } | null;
    const platform = body?.platform?.toUpperCase() as Platform;
    if (!CONNECTABLE_PLATFORMS.includes(platform)) {
        return json({ error: "Platform tidak valid atau tidak mendukung OAuth." }, { status: 400 });
    }

    const credentials = await getCredentialsForPlatform(platform);
    if (!credentials) {
        return json(
            { error: `${platform} belum dikonfigurasi. Hubungi administrator untuk menyiapkan kredensial OAuth.` },
            { status: 400 }
        );
    }

    const statePayload = JSON.stringify({
        organizationId: activeOrganizationId,
        platform,
        timestamp: Date.now(),
    });
    const signature = createHmac("sha256", env.BETTER_AUTH_SECRET).update(statePayload).digest("hex");
    const state = Buffer.from(JSON.stringify({ payload: statePayload, sig: signature })).toString("base64");

    const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/accounts/callback/${platform.toLowerCase()}`;
    const authUrl = getAuthorizationUrl(platform, redirectUri, state, credentials);

    return json({ authUrl, state });
});

/**
 * DELETE /api/accounts — putus koneksi akun.
 * Body: { accountId }
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { accountId?: string } | null;
    if (!body?.accountId) return json({ error: "Account ID wajib." }, { status: 400 });

    const account = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, body.accountId!), _eq(t.organizationId, activeOrganizationId)),
        columns: { id: true },
    });
    if (!account) return json({ error: "Akun tidak ditemukan." }, { status: 404 });

    await db.delete(schema.socialAccount).where(eq(schema.socialAccount.id, body.accountId));
    return json({ success: true });
});