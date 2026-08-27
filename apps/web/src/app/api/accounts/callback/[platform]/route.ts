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
  let state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  // Fallback: ambil state dari cookie jika tidak ada di query params
  // (beberapa platform OAuth tidak meneruskan state parameter)
  if (!state) {
    const cookieHeader = request.headers.get("cookie") || "";
    const stateCookie = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("oauth_state="));
    if (stateCookie) {
      state = decodeURIComponent(stateCookie.split("=").slice(1).join("="));
    }
  }

  if (oauthError) {
    accountsUrl.searchParams.set("error", "oauth_denied");
    return NextResponse.redirect(accountsUrl);
  }
  // Repliz flow: code tidak dikirim ke callback kita (Repliz handle di server mereka)
  // Native flow: code wajib ada
  if (!state) {
    accountsUrl.searchParams.set("error", "missing_state");
    return NextResponse.redirect(accountsUrl);
  }

  // Parse state
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

  // Repliz flow: sync dari Repliz API (tanpa code)
  if (stateData.useRepliz) {
    if (!replizOAuth.isConfigured()) {
      accountsUrl.searchParams.set("error", "repliz_not_configured");
      return NextResponse.redirect(accountsUrl);
    }

    // Tunggu sebentar agar Repliz selesai memproses akun baru
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Sync akun dari Repliz
    let replizAccounts;
    try {
      const { getReplizClient } = await import(
        "@/lib/publishing/adapters/repliz/client"
      );
      const replizClient = getReplizClient();
      if (!replizClient) throw new Error("Repliz client not configured");
      replizAccounts = await replizClient.getAccounts(1, 50);
    } catch (e) {
      console.error(
        `[oauth-callback] Repliz getAccounts failed:`,
        e instanceof Error ? e.message : e,
      );
      accountsUrl.searchParams.set("error", "repliz_sync_failed");
      return NextResponse.redirect(accountsUrl);
    }

    // Filter akun berdasarkan platform
    const platformMap: Record<string, string> = {
      INSTAGRAM: "instagram",
      INSTAGRAM_PAGE: "facebook",
      FACEBOOK: "facebook",
      TIKTOK: "tiktok",
      YOUTUBE: "youtube",
      LINKEDIN: "linkedin",
      THREADS: "threads",
      TWITTER: "twitter",
      SHOPEE: "shopee",
    };
    const replizPlatform = platformMap[platform] || platform.toLowerCase();
    const matchingAccounts = replizAccounts.docs.filter(
      (a) => a.type.toLowerCase() === replizPlatform,
    );

    if (matchingAccounts.length === 0) {
      accountsUrl.searchParams.set("error", "repliz_no_accounts_found");
      return NextResponse.redirect(accountsUrl);
    }

    // Simpan semua akun yang match
    let savedCount = 0;
    for (const account of matchingAccounts) {
      const acctId = account.generatedId || account._id;
      const existing = await db.query.socialAccount.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
          _and(
            _eq(t.organizationId, stateData.organizationId),
            _eq(t.platform, platform),
            _eq(t.platformId, acctId),
          ),
        columns: { id: true },
      });

      try {
        if (existing) {
          await db
            .update(schema.socialAccount)
            .set({
              name: account.name,
              avatar: account.picture ?? null,
              isActive: true,
              lastRefreshError: null,
            })
            .where(eq(schema.socialAccount.id, existing.id));
        } else {
          await db.insert(schema.socialAccount).values({
            id: randomUUID(),
            organizationId: stateData.organizationId,
            platform,
            platformId: acctId,
            name: account.name,
            username: account.username ?? null,
            avatar: account.picture ?? null,
            accessToken: encryptToken("repliz_managed"),
            refreshToken: null,
            tokenExpiry: null,
            isActive: true,
          });
          savedCount++;
        }
      } catch (e) {
        console.error(
          `[oauth-callback] Failed to save Repliz account ${account.name}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    if (savedCount > 0) {
      await logActivity(
        stateData.organizationId,
        "account.connected",
        {
          type: "account",
          id: "repliz",
          name: `${savedCount} akun dari Repliz`,
        },
        { platform, method: "repliz" },
      );
      accountsUrl.searchParams.set("success", "connected");
    } else {
      accountsUrl.searchParams.set("success", "reconnected");
    }

    return NextResponse.redirect(accountsUrl);
  }

  // ── Native OAuth ──────────────────────────────────────────────────────
  if (!code) {
    accountsUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(accountsUrl);
  }

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
