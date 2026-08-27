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

  console.log(`[REPLIZ-DEBUG][CB] === CALLBACK HIT ===`);
  console.log(`[REPLIZ-DEBUG][CB] url=${request.url}`);
  console.log(`[REPLIZ-DEBUG][CB] platform=${platform}`);

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  let state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const allParams: Record<string, string> = {};
  searchParams.forEach((v, k) => { allParams[k] = v; });
  console.log(`[REPLIZ-DEBUG][CB] query_params=${JSON.stringify(allParams)}`);
  console.log(`[REPLIZ-DEBUG][CB] code=${code ? code.substring(0, 20) + "..." : "NULL"}`);
  console.log(`[REPLIZ-DEBUG][CB] state_from_query=${state ? "YES" : "NULL"}`);
  console.log(`[REPLIZ-DEBUG][CB] oauthError=${oauthError || "none"}`);

  // Fallback: ambil state dari cookie
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const oauthCookie = cookies.find((c) => c.startsWith("oauth_state="));
  console.log(`[REPLIZ-DEBUG][CB] cookies_count=${cookies.length}`);
  console.log(`[REPLIZ-DEBUG][CB] oauth_state_cookie=${oauthCookie ? "EXISTS" : "MISSING"}`);

  if (!state && oauthCookie) {
    state = decodeURIComponent(oauthCookie.split("=").slice(1).join("="));
    console.log(`[REPLIZ-DEBUG][CB] state_recovered_from_cookie=YES`);
  }

  if (oauthError) {
    console.log(`[REPLIZ-DEBUG][CB] ERROR: oauth_denied error=${oauthError}`);
    accountsUrl.searchParams.set("error", "oauth_denied");
    return NextResponse.redirect(accountsUrl);
  }

  if (!state) {
    console.log(`[REPLIZ-DEBUG][CB] ERROR: missing_state — no state in query OR cookie`);
    console.log(`[REPLIZ-DEBUG][CB] All cookies: ${JSON.stringify(cookies)}`);
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
    console.log(`[REPLIZ-DEBUG][CB] state_valid: useRepliz=${stateData.useRepliz}, platform=${stateData.platform}, org=${stateData.organizationId}`);
  } catch (e) {
    console.log(`[REPLIZ-DEBUG][CB] ERROR: invalid_state — ${e instanceof Error ? e.message : e}`);
    accountsUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(accountsUrl);
  }

  if (stateData.platform !== platform) {
    console.log(`[REPLIZ-DEBUG][CB] ERROR: state_mismatch state_platform=${stateData.platform} url_platform=${platform}`);
    accountsUrl.searchParams.set("error", "state_mismatch");
    return NextResponse.redirect(accountsUrl);
  }
  if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
    console.log(`[REPLIZ-DEBUG][CB] ERROR: expired_state age=${Date.now() - stateData.timestamp}ms`);
    accountsUrl.searchParams.set("error", "expired_state");
    return NextResponse.redirect(accountsUrl);
  }

  // ── Repliz flow ──
  if (stateData.useRepliz) {
    console.log(`[REPLIZ-DEBUG][CB] === REPLIZ FLOW ===`);
    console.log(`[REPLIZ-DEBUG][CB] code_from_repliz=${code ? "YES: " + code.substring(0, 30) + "..." : "NULL"}`);

    if (!replizOAuth.isConfigured()) {
      console.log(`[REPLIZ-DEBUG][CB] ERROR: repliz_not_configured`);
      accountsUrl.searchParams.set("error", "repliz_not_configured");
      return NextResponse.redirect(accountsUrl);
    }

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

    // Jika ada code dari Repliz callback, coba connect langsung
    if (code) {
      console.log(`[REPLIZ-DEBUG][CB] Attempting connect with code...`);
      try {
        const { getReplizClient } = await import(
          "@/lib/publishing/adapters/repliz/client"
        );
        const replizClient = getReplizClient();
        if (!replizClient) throw new Error("Repliz client not configured");

        const connectResult = await replizClient.connect(replizPlatform, { code });
        console.log(`[REPLIZ-DEBUG][CB] connect_result=${JSON.stringify(connectResult)}`);

        // Fetch full account detail
        const acctId = connectResult.generatedId || connectResult._id;
        console.log(`[REPLIZ-DEBUG][CB] connected account id=${acctId}`);

        // Save ke DB
        const existing = await db.query.socialAccount.findFirst({
          where: (t, { and: _and, eq: _eq }) =>
            _and(
              _eq(t.organizationId, stateData.organizationId),
              _eq(t.platform, platform),
              _eq(t.platformId, acctId),
            ),
          columns: { id: true },
        });

        if (existing) {
          await db
            .update(schema.socialAccount)
            .set({
              name: connectResult.name,
              avatar: connectResult.picture ?? null,
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
            name: connectResult.name,
            username: connectResult.username ?? null,
            avatar: connectResult.picture ?? null,
            accessToken: encryptToken("repliz_managed"),
            refreshToken: null,
            tokenExpiry: null,
            isActive: true,
          });
        }

        await logActivity(
          stateData.organizationId,
          "account.connected",
          { type: "account", id: acctId, name: connectResult.name },
          { platform, method: "repliz_connect" },
        );

        console.log(`[REPLIZ-DEBUG][CB] SUCCESS: account saved name=${connectResult.name}`);
        accountsUrl.searchParams.set("success", "connected");
        return NextResponse.redirect(accountsUrl);
      } catch (e) {
        console.error(`[REPLIZ-DEBUG][CB] connect FAILED:`, e instanceof Error ? e.message : e);
        console.error(`[REPLIZ-DEBUG][CB] connect FAILED stack:`, e instanceof Error ? e.stack : "");
      }
    }

    // Fallback: sync dari Repliz API
    console.log(`[REPLIZ-DEBUG][CB] Falling back to getAccounts sync...`);
    let replizAccounts: {
      docs: Array<{
        generatedId?: string;
        _id: string;
        name: string;
        username?: string;
        picture?: string;
        type: string;
      }>;
      totalDocs: number;
    } = { docs: [], totalDocs: 0 };
    try {
      const { getReplizClient } = await import(
        "@/lib/publishing/adapters/repliz/client"
      );
      const replizClient = getReplizClient();
      if (!replizClient) throw new Error("Repliz client not configured");

      console.log(`[REPLIZ-DEBUG][CB] getAccounts platform_filter=${replizPlatform}`);

      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`[REPLIZ-DEBUG][CB] attempt ${attempt}/3...`);
        replizAccounts = await replizClient.getAccounts({
          page: 1,
          limit: 50,
          types: [replizPlatform],
        });
        console.log(`[REPLIZ-DEBUG][CB] attempt ${attempt} result: totalDocs=${replizAccounts.totalDocs}, docs_count=${replizAccounts.docs.length}`);
        if (replizAccounts.totalDocs > 0) {
          for (const acct of replizAccounts.docs) {
            console.log(`[REPLIZ-DEBUG][CB]   account: id=${acct.generatedId || acct._id}, name=${acct.name}, type=${acct.type}`);
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
      }
    } catch (e) {
      console.error(
        `[REPLIZ-DEBUG][CB] getAccounts FAILED:`,
        e instanceof Error ? e.message : e,
      );
      console.error(`[REPLIZ-DEBUG][CB] getAccounts stack:`, e instanceof Error ? e.stack : "");
      accountsUrl.searchParams.set("error", "repliz_sync_failed");
      return NextResponse.redirect(accountsUrl);
    }

    const matchingAccounts = replizAccounts.docs;

    if (matchingAccounts.length === 0) {
      console.log(`[REPLIZ-DEBUG][CB] ERROR: no_accounts_found after all attempts`);
      accountsUrl.searchParams.set("error", "repliz_no_accounts_found");
      return NextResponse.redirect(accountsUrl);
    }

    // Simpan semua akun yang match
    let savedCount = 0;
    for (const account of matchingAccounts) {
      const acctId = account.generatedId || account._id;
      console.log(`[REPLIZ-DEBUG][CB] Saving account: id=${acctId}, name=${account.name}`);
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
          console.log(`[REPLIZ-DEBUG][CB] Updated existing account ${existing.id}`);
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
          console.log(`[REPLIZ-DEBUG][CB] Inserted new account ${acctId}`);
        }
      } catch (e) {
        console.error(
          `[REPLIZ-DEBUG][CB] save FAILED for ${account.name}:`,
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
        { platform, method: "repliz_sync" },
      );
      accountsUrl.searchParams.set("success", "connected");
    } else {
      accountsUrl.searchParams.set("success", "reconnected");
    }

    console.log(`[REPLIZ-DEBUG][CB] DONE: savedCount=${savedCount}`);
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
