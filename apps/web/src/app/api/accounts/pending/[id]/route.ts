import { NextRequest } from "next/server";
import { db, schema } from "@sahabat-kreator/db";
import { eq, and, gt } from "drizzle-orm";
import { withAuth, json } from "@/lib/api";
import { decryptToken } from "@/lib/token-encryption";
import { fetchPageChoices } from "@/lib/platforms";
import { encryptToken } from "@/lib/token-encryption";
import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

async function loadPendingSession(id: string, organizationId: string) {
    return db.query.pendingOauthSession.findFirst({
        where: (t, { and: _and, eq: _eq, gt: _gt }) =>
            _and(_eq(t.id, id), _eq(t.organizationId, organizationId), _gt(t.expiresAt, new Date())),
        columns: { id: true, organizationId: true, platform: true, accessToken: true },
    });
}

/**
 * GET /api/accounts/pending/[id]
 * Ambil daftar halaman (FACEBOOK) / Instagram business account (INSTAGRAM_PAGE)
 * dari sesi OAuth pending. Token tidak pernah dikirim ke client.
 */
export const GET = withAuth(async (ctx, req: NextRequest, { params }: RouteParams) => {
    const { id } = await params;
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const session = await loadPendingSession(id, activeOrganizationId);
    if (!session) return json({ error: "Sesi pilihan halaman tidak valid atau kedaluwarsa." }, { status: 404 });

    const token = decryptToken(session.accessToken);
    const choices = await fetchPageChoices(token);
    if (!choices) return json({ error: "Gagal mengambil daftar halaman." }, { status: 400 });

    if (session.platform === "INSTAGRAM_PAGE") {
        return json({
            platform: session.platform,
            pages: choices
                .filter((p) => p.instagramBusinessAccount)
                .map((p) => ({
                    pageId: p.pageId,
                    pageName: p.pageName,
                    accountId: p.instagramBusinessAccount!.id,
                    accountName: p.instagramBusinessAccount!.name,
                    username: p.instagramBusinessAccount!.username,
                    avatar: p.instagramBusinessAccount!.profilePicture ?? null,
                })),
        });
    }

    return json({
        platform: session.platform,
        pages: choices.map((p) => ({
            pageId: p.pageId,
            pageName: p.pageName,
            avatar: p.pagePicture ?? null,
        })),
    });
});

/**
 * POST /api/accounts/pending/[id]
 * Pilih halaman target lalu simpan akun sosial. Menghapus sesi pending.
 * Body: { pageId } untuk FACEBOOK; { pageId } untuk INSTAGRAM_PAGE (via page).
 */
export const POST = withAuth(async (ctx, req: NextRequest, { params }: RouteParams) => {
    const { id } = await params;
    const { activeOrganizationId, session } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { pageId?: string } | null;
    if (!body?.pageId) return json({ error: "Pilih halaman tujuan." }, { status: 400 });

    const pending = await loadPendingSession(id, activeOrganizationId);
    if (!pending) return json({ error: "Sesi pilihan halaman tidak valid atau kedaluwarsa." }, { status: 404 });

    const token = decryptToken(pending.accessToken);
    const choices = await fetchPageChoices(token);
    if (!choices) return json({ error: "Gagal mengambil daftar halaman." }, { status: 400 });

    const choice = choices.find((p) => p.pageId === body.pageId);
    if (!choice) return json({ error: "Halaman tidak ditemukan dalam sesi." }, { status: 400 });

    const platform = pending.platform as "FACEBOOK" | "INSTAGRAM_PAGE";

    let profile: { platformId: string; name: string; username: string; profilePicture?: string | null };
    if (platform === "INSTAGRAM_PAGE") {
        const ig = choice.instagramBusinessAccount;
        if (!ig) return json({ error: "Halaman ini tidak memiliki Instagram business account." }, { status: 400 });
        profile = {
            platformId: ig.id,
            name: ig.name,
            username: ig.username,
            profilePicture: ig.profilePicture,
        };
    } else {
        profile = {
            platformId: choice.pageId,
            name: choice.pageName,
            username: choice.pageName,
            profilePicture: choice.pagePicture ?? null,
        };
    }

    const effectiveToken = choice.pageAccessToken;
    const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // page token ~60 hari

    const existing = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, activeOrganizationId), _eq(t.platform, platform), _eq(t.platformId, profile.platformId)),
        columns: { id: true },
    });

    try {
        if (existing) {
            await db
                .update(schema.socialAccount)
                .set({
                    accessToken: encryptToken(effectiveToken),
                    tokenExpiry,
                    name: profile.name,
                    username: profile.username,
                    avatar: profile.profilePicture ?? null,
                    isActive: true,
                    lastRefreshError: null,
                    lastRefreshAt: null,
                })
                .where(eq(schema.socialAccount.id, existing.id));
        } else {
            await db.insert(schema.socialAccount).values({
                id: randomUUID(),
                organizationId: activeOrganizationId,
                platform,
                platformId: profile.platformId,
                name: profile.name,
                username: profile.username,
                avatar: profile.profilePicture ?? null,
                accessToken: encryptToken(effectiveToken),
                tokenExpiry,
                isActive: true,
            });
        }

        await db.delete(schema.pendingOauthSession).where(eq(schema.pendingOauthSession.id, id));

        await logActivity(
            activeOrganizationId,
            existing ? "account.refreshed" : "account.connected",
            { type: "account", id: existing?.id ?? "new", name: profile.name },
            { platform, pageId: choice.pageId },
            { userId: session.user.id, userName: session.user.name ?? session.user.email ?? undefined },
        );

        return json({ success: true, platform, name: profile.name });
    } catch {
        return json({ error: "Gagal menyimpan akun." }, { status: 500 });
    }
});