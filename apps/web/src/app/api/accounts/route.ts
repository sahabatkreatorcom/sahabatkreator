import { createHmac } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { env } from "@sahabat-kreator/env/server";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { json, withAuth } from "@/lib/api";
import {
  CONNECTABLE_PLATFORMS,
  getAuthorizationUrl,
  getCredentialsForPlatform,
  type Platform,
} from "@/lib/platforms";
import { replizOAuth } from "@/lib/publishing/adapters/repliz/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/accounts — daftar akun sosial yang terhubung di workspace.
 */
export const GET = withAuth(async (ctx) => {
  const { activeOrganizationId } = ctx;
  if (!activeOrganizationId)
    return json({ error: "Pilih workspace dulu." }, { status: 400 });

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
      hasRefreshToken: Boolean(a.refreshToken),
      lastRefreshError: a.lastRefreshError
        ? "Perlu perhatian — token mungkin bermasalah."
        : null,
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

/**
 * POST /api/accounts — mulai alur OAuth untuk platform.
 * Body: { platform, useRepliz? }
 * Mengembalikan { authUrl, state }.
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
  const { activeOrganizationId } = ctx;
  if (!activeOrganizationId)
    return json({ error: "Pilih workspace dulu." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    platform?: string;
    useRepliz?: boolean;
  } | null;
  const platform = body?.platform?.toUpperCase() as Platform;
  const useRepliz = body?.useRepliz === true;

  if (!CONNECTABLE_PLATFORMS.includes(platform)) {
    return json(
      { error: "Platform tidak valid atau tidak mendukung OAuth." },
      { status: 400 },
    );
  }

  const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "");
  const redirectUri = `${baseUrl}/api/accounts/callback/${platform.toLowerCase()}`;

  // ── Repliz OAuth ──────────────────────────────────────────────────────
  if (useRepliz) {
    if (!replizOAuth.isConfigured()) {
      return json(
        {
          error:
            "Repliz belum dikonfigurasi. Set REPLIZ_ACCESS_KEY dan REPLIZ_SECRET_KEY.",
        },
        { status: 400 },
      );
    }

    const replizPlatform = replizOAuth.getReplizPlatform(platform);
    if (!replizPlatform) {
      return json(
        { error: `${platform} tidak didukung oleh Repliz OAuth.` },
        { status: 400 },
      );
    }

    // State: sertakan flag useRepliz agar callback tahu ini dari Repliz
    const statePayload = JSON.stringify({
      organizationId: activeOrganizationId,
      platform,
      timestamp: Date.now(),
      useRepliz: true,
    });
    const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(statePayload)
      .digest("hex");
    const state = Buffer.from(
      JSON.stringify({ payload: statePayload, sig: signature }),
    ).toString("base64");

    try {
      // Repliz akan redirect ke redirectUri setelah proses OAuth selesai
      // State disimpan di cookie (bukan di URL) agar lebih bersih
      console.log(
        `[accounts] Repliz authorize: platform=${platform}, redirect=${redirectUri}`,
      );
      const authUrl = await replizOAuth.getAuthorizationUrl(
        platform,
        redirectUri,
      );
      console.log(
        `[accounts] Repliz authUrl received: ${authUrl.substring(0, 100)}...`,
      );
      // Simpan state di cookie sebagai fallback (beberapa platform tidak kirim state balik)
      const response = json({ authUrl, state });
      response.headers.set(
        "Set-Cookie",
        `oauth_state=${state}; Path=/api/accounts/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
      );
      return response;
    } catch (e) {
      console.error(
        "[accounts] Repliz authorize failed:",
        e instanceof Error ? e.message : e,
      );
      return json(
        { error: "Gagal membuat URL otorisasi Repliz." },
        { status: 500 },
      );
    }
  }

  // ── Native OAuth ──────────────────────────────────────────────────────
  const credentials = await getCredentialsForPlatform(platform);
  if (!credentials) {
    return json(
      {
        error: `${platform} belum dikonfigurasi. Hubungi administrator untuk menyiapkan kredensial OAuth.`,
      },
      { status: 400 },
    );
  }

  const statePayload = JSON.stringify({
    organizationId: activeOrganizationId,
    platform,
    timestamp: Date.now(),
  });
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(statePayload)
    .digest("hex");
  const state = Buffer.from(
    JSON.stringify({ payload: statePayload, sig: signature }),
  ).toString("base64");

  const authUrl = getAuthorizationUrl(
    platform,
    redirectUri,
    state,
    credentials,
  );

  return json({ authUrl, state });
});

/**
 * DELETE /api/accounts — putus koneksi akun.
 * Body: { accountId }
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
  const { activeOrganizationId } = ctx;
  if (!activeOrganizationId)
    return json({ error: "Pilih workspace dulu." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    accountId?: string;
  } | null;
  if (!body?.accountId)
    return json({ error: "Account ID wajib." }, { status: 400 });

  const account = await db.query.socialAccount.findFirst({
    where: (t, { and: _and, eq: _eq }) =>
      _and(
        _eq(t.id, body.accountId!),
        _eq(t.organizationId, activeOrganizationId),
      ),
    columns: { id: true, name: true, platform: true },
  });
  if (!account)
    return json({ error: "Akun tidak ditemukan." }, { status: 404 });

  await db
    .delete(schema.socialAccount)
    .where(eq(schema.socialAccount.id, body.accountId));
  await logActivity(
    activeOrganizationId,
    "account.disconnected",
    { type: "account", id: account.id, name: account.name },
    { platform: account.platform },
    {
      userId: ctx.session.user.id,
      userName: ctx.session.user.name ?? ctx.session.user.email ?? undefined,
    },
  );
  return json({ success: true });
});
