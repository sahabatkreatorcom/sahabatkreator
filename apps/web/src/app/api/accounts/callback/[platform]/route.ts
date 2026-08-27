import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { env } from "@sahabat-kreator/env/server";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import {
  CONNECTABLE_PLATFORMS,
  exchangeCodeForToken,
  fetchPlatformProfile,
  getCredentialsForPlatform,
  type Platform,
} from "@/lib/platforms";
import { replizOAuth } from "@/lib/publishing/adapters/repliz/oauth";
import { encryptToken } from "@/lib/token-encryption";
import { subscribeInstagramCommentWebhook } from "@/lib/webhooks/meta";

export const dynamic = "force-dynamic";

interface CallbackParams {
  params: Promise<{ platform: string }>;
}

/**
 * GET /api/accounts/callback/[platform]
 * Tukar kode OAuth → token → simpan akun sosial.
 */
export async function GET(request: NextRequest, { params }: CallbackParams) {
  const { platform: platformParam } = await params;
  const platform = platformParam.toUpperCase() as Platform;
  const baseUrl = env.BETTER_AUTH_URL.replace(/\/$/, "");
  const accountsUrl = new URL("/connections", baseUrl);

  if (!CONNECTABLE_PLATFORMS.includes(platform)) {
    accountsUrl.searchParams.set("error", "invalid_platform");
    return NextResponse.redirect(accountsUrl);
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    accountsUrl.searchParams.set("error", "oauth_denied");
    return NextResponse.redirect(accountsUrl);
  }
  if (!code || !state) {
    accountsUrl.searchParams.set("error", "missing_params");
    return NextResponse.redirect(accountsUrl);
  }

  let stateData: {
    organizationId: string;
    platform: string;
    timestamp: number;
    useRepliz?: boolean;
  };
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64").toString());
    if (!decoded.payload || !decoded.sig) throw new Error("unsigned state");
    const expectedSig = createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(decoded.payload)
      .digest();
    const receivedSig = Buffer.from(decoded.sig, "hex");
    if (
      receivedSig.length !== expectedSig.length ||
      !timingSafeEqual(receivedSig, expectedSig)
    ) {
      throw new Error("bad signature");
    }
    stateData = JSON.parse(decoded.payload);
  } catch {
    accountsUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(accountsUrl);
  }

  if (stateData.platform !== platform) {
    accountsUrl.searchParams.set("error", "state_mismatch");
    return NextResponse.redirect(accountsUrl);
  }
  if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
    accountsUrl.searchParams.set("error", "expired_state");
    return NextResponse.redirect(accountsUrl);
  }

  // ── Repliz OAuth ──────────────────────────────────────────────────────
  if (stateData.useRepliz) {
    if (!replizOAuth.isConfigured()) {
      accountsUrl.searchParams.set("error", "repliz_not_configured");
      return NextResponse.redirect(accountsUrl);
    }

    let exchangeResult: Record<string, string>;
    try {
      exchangeResult = await replizOAuth.exchangeCode(platform, code, state);
    } catch (e) {
      console.error(
        `[oauth-callback] Repliz ${platform} exchange failed:`,
        e instanceof Error ? e.message : e,
      );
      accountsUrl.searchParams.set("error", "repliz_exchange_failed");
      return NextResponse.redirect(accountsUrl);
    }

        let connected: { platformAccountId: string; platformAccountName: string; picture?: string };
    try {
      connected = await replizOAuth.connectAccount(platform, exchangeResult);
    } catch (e) {
      console.error(
        `[oauth-callback] Repliz ${platform} connect failed:`,
        e instanceof Error ? e.message : e,
      );
      accountsUrl.searchParams.set("error", "repliz_connect_failed");
      return NextResponse.redirect(accountsUrl);
    }

    // Simpan akun Repliz ke database
    const existing = await db.query.socialAccount.findFirst({
      where: (t, { and: _and, eq: _eq }) =>
        _and(
          _eq(t.organizationId, stateData.organizationId),
          _eq(t.platform, platform),
          _eq(t.platformId, connected.platformAccountId),
        ),
      columns: { id: true },
    });

    try {
      if (existing) {
        await db
          .update(schema.socialAccount)
          .set({
            name: connected.platformAccountName,
            avatar: connected.picture ?? null,
            isActive: true,
            lastRefreshError: null,
          })
          .where(eq(schema.socialAccount.id, existing.id));
        accountsUrl.searchParams.set("success", "reconnected");
      } else {
        await db.insert(schema.socialAccount).values({
          id: randomUUID(),
          organizationId: stateData.organizationId,
          platform,
          platformId: connected.platformAccountId,
          name: connected.platformAccountName,
          username: null,
          avatar: connected.picture ?? null,
          accessToken: encryptToken("repliz_managed"),
          refreshToken: null,
          tokenExpiry: null,
          isActive: true,
        });
        accountsUrl.searchParams.set("success", "connected");
      }

      await logActivity(
        stateData.organizationId,
        existing ? "account.refreshed" : "account.connected",
        {
          type: "account",
          id: existing?.id ?? "new",
          name: connected.platformAccountName,
        },
        { platform, method: "repliz" },
      );
    } catch {
      accountsUrl.searchParams.set("error", "save_failed");
      return NextResponse.redirect(accountsUrl);
    }

    return NextResponse.redirect(accountsUrl);
  }

  // ── Native OAuth ──────────────────────────────────────────────────────
  const credentials = await getCredentialsForPlatform(platform);
  if (!credentials) {
    accountsUrl.searchParams.set("error", "no_credentials");
    return NextResponse.redirect(accountsUrl);
  }

  let tokens: { accessToken: string; refreshToken?: string; expiresIn: number };
  try {
    const redirectUri = `${baseUrl}/api/accounts/callback/${platform.toLowerCase()}`;
    tokens = await exchangeCodeForToken(
      platform,
      code,
      redirectUri,
      credentials,
    );
  } catch (e) {
    console.error(
      `[oauth-callback] ${platform} token exchange failed:`,
      e instanceof Error ? e.message : e,
    );
    accountsUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(accountsUrl);
  }

  // FACEBOOK & INSTAGRAM_PAGE butuh pemilihan halaman target — simpan token
  // sementara, lalu biarkan user memilih halaman di halaman connections.
  if (platform === "FACEBOOK" || platform === "INSTAGRAM_PAGE") {
    try {
      const sessionId = randomUUID();
      await db.insert(schema.pendingOauthSession).values({
        id: sessionId,
        organizationId: stateData.organizationId,
        platform,
        accessToken: encryptToken(tokens.accessToken),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      const pickUrl = new URL("/connections", baseUrl);
      pickUrl.searchParams.set("pending", sessionId);
      pickUrl.searchParams.set("platform", platform);
      return NextResponse.redirect(pickUrl);
    } catch {
      accountsUrl.searchParams.set("error", "save_failed");
      return NextResponse.redirect(accountsUrl);
    }
  }

  const profile = await fetchPlatformProfile(platform, tokens.accessToken);
  if (!profile) {
    accountsUrl.searchParams.set("error", "profile_fetch_failed");
    return NextResponse.redirect(accountsUrl);
  }

  const tokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);

  const existing = await db.query.socialAccount.findFirst({
    where: (t, { and: _and, eq: _eq }) =>
      _and(
        _eq(t.organizationId, stateData.organizationId),
        _eq(t.platform, platform),
        _eq(t.platformId, profile.platformId),
      ),
    columns: { id: true },
  });

  try {
    if (existing) {
      await db
        .update(schema.socialAccount)
        .set({
          accessToken: encryptToken(tokens.accessToken),
          refreshToken: tokens.refreshToken
            ? encryptToken(tokens.refreshToken)
            : null,
          tokenExpiry,
          name: profile.name,
          username: profile.username,
          avatar: profile.profilePicture ?? null,
          isActive: true,
          lastRefreshError: null,
          lastRefreshAt: null,
        })
        .where(eq(schema.socialAccount.id, existing.id));
      accountsUrl.searchParams.set("success", "reconnected");
    } else {
      await db.insert(schema.socialAccount).values({
        id: randomUUID(),
        organizationId: stateData.organizationId,
        platform,
        platformId: profile.platformId,
        name: profile.name,
        username: profile.username,
        avatar: profile.profilePicture ?? null,
        accessToken: encryptToken(tokens.accessToken),
        refreshToken: tokens.refreshToken
          ? encryptToken(tokens.refreshToken)
          : null,
        tokenExpiry,
        isActive: true,
      });
      accountsUrl.searchParams.set("success", "connected");
    }

    await logActivity(
      stateData.organizationId,
      existing ? "account.refreshed" : "account.connected",
      { type: "account", id: existing?.id ?? "new", name: profile.name },
      { platform },
    );

    // Instagram standalone: subscribe akun ke webhook komentar (wajib per-akun).
    // Non-fatal — kalau gagal, komentar tetap bisa disync berkala.
    if (platform === "INSTAGRAM") {
      await subscribeInstagramCommentWebhook(
        profile.platformId,
        tokens.accessToken,
      ).catch(() => false);
    }
  } catch {
    accountsUrl.searchParams.set("error", "save_failed");
    return NextResponse.redirect(accountsUrl);
  }

  return NextResponse.redirect(accountsUrl);
}
