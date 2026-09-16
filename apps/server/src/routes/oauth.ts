// API OAuth — connect akun social media via OAuth 2.0 redirect flow
// Flow: GET /oauth/:platform/start (auth, buat state) → redirect platform consent
//       → GET /oauth/:platform/callback (state validasi, exchange code, upsert akun)
//       → redirect web app dengan status
//       → bila Meta (FB/IG) mengelola > 1 Page → simpan oauth_pending_selection,
//         redirect ke /accounts?pending=<id> agar user pilih Page (picker UI)

import { db } from "@sahabatkreator/db";
import {
  oauthPendingSelection,
  oauthState,
  platformCredential,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  type AppCredential,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchPlatformProfile,
  isOAuthPlatformSupported,
  GRAPH_FB_URL,
  GRAPH_THREADS_REVOKE_URL,
  GOOGLE_OAUTH_REVOKE_URL,
  LINKEDIN_OAUTH_REVOKE_URL,
  PINTEREST_API_BASE_URL,
  type OAuthPlatform,
  type ReplizAccount,
  replizAuthorizeUrl,
  replizExchangeCode,
  replizGetFacebookPages,
  replizGetLinkedInOrganizations,
  replizGetYouTubeChannels,
  TIKTOK_OPEN_API_URL,
} from "@sahabatkreator/publishing";
import { and, eq, lt } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";
import { getReplizCredentials, isReplizRouted, toReplizPlatformKey } from "../lib/bridge";
import { encrypt } from "../lib/crypto";
import { generateId } from "../lib/id";
import {
  buildPendingLinkedIn,
  buildPendingPages,
  buildPendingPinterest,
  type RawLinkedInOrganization,
  type RawMetaPage,
} from "../lib/oauth-connect";

export const oauthRoute = new Hono();

/** Mapping platform → env kredensial (playbook app-review-playbook.md) */
const ENV_CREDENTIAL_KEYS: Record<string, { id: keyof typeof env; secret: keyof typeof env }> = {
  // Instagram (akun bisnis via FB Login) & Facebook — satu aplikasi Meta
  instagram: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  facebook: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  // Instagram Login standalone — app IG sendiri di dev console Meta
  instagram_standalone: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
  threads: { id: "THREADS_APP_ID", secret: "THREADS_APP_SECRET" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
  youtube: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  google_business: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  pinterest: { id: "PINTEREST_APP_ID", secret: "PINTEREST_APP_SECRET" },
  linkedin: { id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET" },
  // App LinkedIn KEDUA (Community Management API) — kredensial & callback terpisah,
  // karena product itu wajib jadi satu-satunya product di app-nya.
  linkedin_org: { id: "LINKEDIN_ORG_CLIENT_ID", secret: "LINKEDIN_ORG_CLIENT_SECRET" },
};

/** Kredensial app per platform: platform_credential (DB, admin-managed) → fallback env */
async function getAppCredential(platform: OAuthPlatform): Promise<AppCredential> {
  const [cred] = await db
    .select()
    .from(platformCredential)
    .where(and(eq(platformCredential.platform, platform), eq(platformCredential.isActive, true)))
    .limit(1);

  const envKeys = ENV_CREDENTIAL_KEYS[platform];
  const envClientId = envKeys ? (env[envKeys.id] as string | undefined) : undefined;
  const envClientSecret = envKeys ? (env[envKeys.secret] as string | undefined) : undefined;

  let clientId: string | undefined;
  let clientSecret: string | undefined;
  if (cred) {
    clientId = cred.clientId;
    const { decrypt } = await import("../lib/crypto");
    try {
      clientSecret = decrypt(cred.clientSecretEnc);
    } catch {
      clientSecret = undefined;
    }
  }
  if (!clientId) clientId = envClientId;
  if (!clientSecret) clientSecret = envClientSecret;

  const serverUrl = env.SERVER_URL || "http://localhost:3000";
  const redirectUri = cred?.redirectUri || `${serverUrl}/api/oauth/${platform}/callback`;

  if (!clientId || !clientSecret) {
    const { HTTPError } = await import("../lib/auth-guard");
    throw new HTTPError(
      400,
      `Kredensial OAuth ${platform} belum dikonfigurasi. Admin dapat mengaturnya di Admin Panel → Kredensial Platform, atau set ${envKeys ? `${String(envKeys.id)}/${String(envKeys.secret)}` : "env"} di .env`,
    );
  }

  // Extra scopes dari env (LinkedIn/TikTok: scope product terpisah, setelah approved)
  const extra: Record<string, string> = {};
  if (platform === "linkedin" && env.LINKEDIN_EXTRA_SCOPES) {
    extra.extraScopes = env.LINKEDIN_EXTRA_SCOPES;
  }
  if (platform === "tiktok" && env.TIKTOK_EXTRA_SCOPES) {
    extra.extraScopes = env.TIKTOK_EXTRA_SCOPES;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

/**
 * GET /oauth/:platform/start — mulai OAuth flow.
 * Return JSON { authorizeUrl } — frontend redirect ke URL tsb.
 * (Tidak langsung 302 agar state tercatat dulu di DB.)
 */
oauthRoute.get("/:platform/start", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const platform = c.req.param("platform") as OAuthPlatform;
    if (!isOAuthPlatformSupported(platform)) {
      return c.json({ message: `OAuth platform ${platform} tidak didukung.` }, 400);
    }
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    // Bridge Repliz: connect-flow baru diarahkan ke OAuth app Repliz (bukan app native)
    if (await isReplizRouted(platform)) {
      const cred = await getReplizCredentials();
      const platformKey = toReplizPlatformKey(platform);
      if (!cred || !platformKey) {
        return c.json(
          { message: "Bridge Repliz aktif tapi kredensial belum dikonfigurasi admin." },
          400,
        );
      }
      const state = generateId("oauthstate") + generateId("nonce");
      await db.insert(oauthState).values({
        id: generateId("ost"),
        state,
        platform,
        organizationId: ctx.organization.id,
        userId: ctx.user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      await db.delete(oauthState).where(lt(oauthState.expiresAt, new Date()));
      // State HARUS di path (bukan query) — validasi redirect Repliz menolak URL
      // dengan query string, tapi menerima path tambahan. Terbukti via spike:
      // browser tiba di /repliz-callback/{state}?code=... (path utuh + code ditambahkan).
      const serverUrl = env.SERVER_URL || "http://localhost:3000";
      const redirect = `${serverUrl}/api/oauth/${platform}/repliz-callback/${state}`;
      const authorizeUrl = await replizAuthorizeUrl(cred, platformKey, redirect);
      return c.json({ authorizeUrl });
    }

    const cred = await getAppCredential(platform);

    // State random + persist (TTL 10 menit, sekali pakai)
    const state = generateId("oauthstate") + generateId("nonce");
    await db.insert(oauthState).values({
      id: generateId("ost"),
      state,
      platform,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Bersihkan state expired (housekeeping ringan tiap start)
    await db.delete(oauthState).where(lt(oauthState.expiresAt, new Date()));

    const authorizeUrl = buildAuthorizeUrl(platform, cred, state);
    return c.json({ authorizeUrl });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /oauth/:platform/callback — endpoint redirect dari platform.
 * Publik (platform tidak membawa cookie user). Validasi via state → org/user dari state row.
 */
oauthRoute.get("/:platform/callback", async (c) => {
  const platform = c.req.param("platform") as OAuthPlatform;
  const failRedirect = (msg: string) =>
    c.redirect(`${env.WEB_URL}/accounts?connect_error=${encodeURIComponent(msg)}`);

  try {
    if (!isOAuthPlatformSupported(platform)) {
      return failRedirect("Platform tidak didukung");
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const errorParam = c.req.query("error_description") ?? c.req.query("error");
    if (errorParam) return failRedirect(errorParam);
    if (!code || !state) return failRedirect("Kode otorisasi tidak lengkap");

    // Validasi state: harus ada, belum expired, sekali pakai (delete langsung)
    const [stateRow] = await db
      .delete(oauthState)
      .where(and(eq(oauthState.state, state), eq(oauthState.platform, platform)))
      .returning();
    if (!stateRow)
      return failRedirect("State OAuth tidak valid atau kedaluwarsa. Coba hubungkan ulang.");
    if (stateRow.expiresAt < new Date()) {
      return failRedirect("State OAuth kedaluwarsa. Coba hubungkan ulang.");
    }

    const cred = await getAppCredential(platform);

    // Exchange code → token
    const token = await exchangeCodeForToken(platform, cred, code);

    // Fetch profil user
    const profile = await fetchPlatformProfile(platform, token);

    // Meta (FB/IG) multi-Page → jangan auto-pilih; simpan pending & minta user pilih
    // (kenapa: pages[0] bisa bukan Page yang dimaksud → salah akun publish)
    if (
      (platform === "instagram" || platform === "facebook") &&
      Array.isArray(profile.extra?.pages) &&
      (profile.extra.pages as RawMetaPage[]).length > 1
    ) {
      const pending = buildPendingPages(platform, profile.extra.pages as RawMetaPage[]);
      await db.insert(oauthPendingSelection).values({
        id: pending.id,
        userId: stateRow.userId,
        organizationId: stateRow.organizationId,
        platform,
        pagesData: pending.pagesData,
        expiresAt: pending.expiresAt,
      });
      return c.redirect(`${env.WEB_URL}/accounts?pending=${encodeURIComponent(pending.id)}`);
    }

    // LinkedIn multi-entity (note.md #15): user ADMIN ≥ 1 company → pilih profil
    // pribadi vs company (posting sebagai company butuh scope org ter-approve).
    // Tanpa organizations (product belum approved) → lanjut auto-connect person.
    if (
      platform === "linkedin" &&
      Array.isArray(profile.extra?.organizations) &&
      (profile.extra.organizations as RawLinkedInOrganization[]).length > 0
    ) {
      const person = profile.extra.person as { sub: string; name: string };
      const pending = buildPendingLinkedIn({
        person: { sub: person.sub, name: person.name },
        organizations: profile.extra.organizations as RawLinkedInOrganization[],
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scopes: token.scopes,
      });
      await db.insert(oauthPendingSelection).values({
        id: pending.id,
        userId: stateRow.userId,
        organizationId: stateRow.organizationId,
        platform: "linkedin",
        pagesData: pending.pagesData,
        expiresAt: pending.expiresAt,
      });
      return c.redirect(`${env.WEB_URL}/accounts?pending=${encodeURIComponent(pending.id)}`);
    }

    // LinkedIn company-only (app Community Management API). Flow ini TIDAK punya
    // profil person (app tanpa `openid` → /v2/userinfo tidak tersedia), jadi user
    // selalu memilih salah satu halaman company yang dia admin.
    if (platform === "linkedin_org") {
      const organizations = (profile.extra?.organizations ?? []) as RawLinkedInOrganization[];
      if (organizations.length === 0) {
        return failRedirect("Tidak ada halaman company LinkedIn yang bisa dihubungkan.");
      }
      const pending = buildPendingLinkedIn({
        organizations,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scopes: token.scopes,
        platform: "linkedin_org",
      });
      await db.insert(oauthPendingSelection).values({
        id: pending.id,
        userId: stateRow.userId,
        organizationId: stateRow.organizationId,
        platform: "linkedin_org",
        pagesData: pending.pagesData,
        expiresAt: pending.expiresAt,
      });
      return c.redirect(`${env.WEB_URL}/accounts?pending=${encodeURIComponent(pending.id)}`);
    }

    // Pinterest: entitas = board (publish butuh board_id) → user pilih board via picker
    if (platform === "pinterest" && Array.isArray(profile.extra?.boards)) {
      const boards = profile.extra.boards as Array<{ id: string; name: string; privacy?: string }>;
      if (boards.length === 0) {
        return failRedirect(
          "Akun Pinterest tidak memiliki board. Buat minimal satu board dulu di Pinterest.",
        );
      }
      const pending = buildPendingPinterest({
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        boards,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        scopes: token.scopes,
      });
      await db.insert(oauthPendingSelection).values({
        id: pending.id,
        userId: stateRow.userId,
        organizationId: stateRow.organizationId,
        platform: "pinterest",
        pagesData: pending.pagesData,
        expiresAt: pending.expiresAt,
      });
      return c.redirect(`${env.WEB_URL}/accounts?pending=${encodeURIComponent(pending.id)}`);
    }

    // Upsert social_account (unique: platform + platformAccountId)
    // Bila akun sama sudah ada di org lain → error (satu akun platform satu org, hindari bentrok publish)
    const [existing] = await db
      .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.platform, platform),
          eq(socialAccount.platformAccountId, profile.platformAccountId),
        ),
      )
      .limit(1);

    const accessTokenEnc = encrypt(token.accessToken);
    const refreshTokenEnc = token.refreshToken ? encrypt(token.refreshToken) : null;

    if (existing) {
      if (existing.organizationId !== stateRow.organizationId) {
        return failRedirect("Akun ini sudah terhubung di organisasi lain.");
      }
      // Re-connect: update token & profil (user re-grant setelah token expire/revoke)
      await db
        .update(socialAccount)
        .set({
          username: profile.username,
          displayName: profile.displayName ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiresAt: token.expiresAt ?? null,
          scopes: token.scopes,
          isConnected: true,
          lastError: null,
          metadata: profile.extra ?? null,
          lastSyncedAt: new Date(),
        })
        .where(eq(socialAccount.id, existing.id));

      // Catat aktivitas org: akun di-reconnect (user pelaku = pemilik state OAuth)
      fireActivity({
        orgId: stateRow.organizationId,
        userId: stateRow.userId,
        action: "account.reconnected",
        targetType: "social_account",
        targetId: existing.id,
        metadata: { platform, username: profile.username },
      });
    } else {
      const id = generateId("socacc");
      await db.insert(socialAccount).values({
        id,
        organizationId: stateRow.organizationId,
        platform,
        platformAccountId: profile.platformAccountId,
        username: profile.username,
        displayName: profile.displayName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiresAt: token.expiresAt ?? null,
        scopes: token.scopes,
        isConnected: true,
        metadata: profile.extra ?? null,
        lastSyncedAt: new Date(),
      });

      // Catat aktivitas org: akun baru terhubung via OAuth
      fireActivity({
        orgId: stateRow.organizationId,
        userId: stateRow.userId,
        action: "account.connected",
        targetType: "social_account",
        targetId: id,
        metadata: { platform, username: profile.username },
      });
    }

    return c.redirect(`${env.WEB_URL}/accounts?connect_success=${platform}`);
  } catch (error) {
    console.error(`[oauth] callback ${platform} gagal:`, error);
    const msg = error instanceof Error ? error.message : "Gagal menghubungkan akun";
    return failRedirect(msg.slice(0, 300));
  }
});

/**
 * GET /oauth/:platform/repliz-callback/:state — callback dari halaman Repliz setelah
 * user approve OAuth di platform (via app milik Repliz). Terbukti via spike: browser
 * tiba di path redirect utuh dengan ?code=<repliz exchange code> ditambahkan Repliz
 * (state kita di path karena validasi redirect Repliz menolak query string).
 * Flow: exchange code → token Repliz → (FB: get-page → picker) → connect → accountId.
 */
oauthRoute.get("/:platform/repliz-callback/:state", async (c) => {
  const platform = c.req.param("platform") as OAuthPlatform;
  const failRedirect = (msg: string) =>
    c.redirect(`${env.WEB_URL}/accounts?connect_error=${encodeURIComponent(msg)}`);

  try {
    if (!isOAuthPlatformSupported(platform)) {
      return failRedirect("Platform tidak didukung");
    }

    const code = c.req.query("code");
    const state = c.req.param("state");
    const errorParam = c.req.query("error_description") ?? c.req.query("error");
    if (errorParam) return failRedirect(errorParam);
    if (!code || !state) return failRedirect("Kode otorisasi tidak lengkap");

    const [stateRow] = await db
      .delete(oauthState)
      .where(and(eq(oauthState.state, state), eq(oauthState.platform, platform)))
      .returning();
    if (!stateRow)
      return failRedirect("State OAuth tidak valid atau kedaluwarsa. Coba hubungkan ulang.");
    if (stateRow.expiresAt < new Date()) {
      return failRedirect("State OAuth kedaluwarsa. Coba hubungkan ulang.");
    }

    const cred = await getReplizCredentials();
    const platformKey = toReplizPlatformKey(platform);
    if (!cred || !platformKey) {
      return failRedirect("Bridge Repliz tidak aktif — hubungi admin");
    }

    // Pola connect berbeda per platform (docs.repliz.com):
    // - instagram / instagram_standalone / threads / tiktok: connect({ code }) — tanpa
    //   exchange (API Instagram Repliz tidak punya endpoint exchange; FB-page-picker
    //   IG flow native tidak ada padanannya di Repliz → dua tombol IG sama-sama direct)
    // - facebook: exchange → get-page → picker → connect({ pageId, token })
    // - youtube:  exchange → get-channel → picker → connect({ channelId, token })
    // - linkedin: exchange → get-organization → picker → connect({ organizationId, token })
    if (
      platform === "instagram" ||
      platform === "instagram_standalone" ||
      platform === "threads" ||
      platform === "tiktok"
    ) {
      const { replizConnectAccount, replizGetAccount } = await import("@sahabatkreator/publishing");
      const accountId = await replizConnectAccount(cred, platformKey, { code });
      const info = await replizGetAccount(cred, accountId);
      return await upsertReplizAccount(c, { platform, accountId, info, stateRow });
    }

    // 1. Exchange code → token Repliz (token user-level platform, short-lived)
    const token = await replizExchangeCode(cred, platformKey, code);

    // 2. Multi-entity (FB Page / channel YouTube / org LinkedIn): picker dulu.
    //    Simpan pending selection (entity token terenkripsi), user pilih.
    if (platform === "facebook" || platform === "youtube" || platform === "linkedin") {
      const entities =
        platform === "facebook"
          ? await replizGetFacebookPages(cred, token)
          : platform === "youtube"
            ? await replizGetYouTubeChannels(cred, token)
            : await replizGetLinkedInOrganizations(cred, token);
      if (entities.length === 0) {
        return failRedirect(
          platform === "facebook"
            ? "Tidak ada Facebook Page yang bisa diakses akun ini"
            : platform === "youtube"
              ? "Tidak ada channel YouTube yang bisa diakses akun ini"
              : "Tidak ada LinkedIn organization yang Anda admin",
        );
      }
      const pendingId = generateId("oauthpend");
      const pagesData: {
        pageId: string;
        pageName: string;
        pageAccessTokenEnc: string;
        igUserId: null;
        igUsername: string | null;
        replizBridge: boolean;
      }[] = entities.map((p) => ({
        pageId: p.id, // FB pageId / YT channelId / LinkedIn organizationId (URN)
        pageName: p.name,
        pageAccessTokenEnc: encrypt(p.token), // entity token Repliz (terenkripsi at-rest)
        igUserId: null,
        igUsername: p.username ?? null,
        // Marker flow Repliz — picker select mendeteksi ini untuk connect via bridge
        replizBridge: true,
      }));
      await db.insert(oauthPendingSelection).values({
        id: pendingId,
        userId: stateRow.userId,
        organizationId: stateRow.organizationId,
        platform,
        pagesData: JSON.stringify(pagesData),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      return c.redirect(`${env.WEB_URL}/accounts?pending=${encodeURIComponent(pendingId)}`);
    }

    // 3. Platform lain via bridge (mis. instagram business via FB Login) — connect token
    const { replizConnectAccount, replizGetAccount } = await import("@sahabatkreator/publishing");
    const accountId = await replizConnectAccount(cred, platformKey, { code });
    const info = await replizGetAccount(cred, accountId);
    return await upsertReplizAccount(c, { platform, accountId, info, stateRow });
  } catch (error) {
    console.error(`[oauth] repliz-callback ${platform} gagal:`, error);
    const msg = error instanceof Error ? error.message : "Gagal menghubungkan akun via Repliz";
    return failRedirect(msg.slice(0, 300));
  }
});

/**
 * Simpan/refresh social_account hasil connect Repliz + redirect sukses.
 * Dipakai callback (platform single-entity) — FB/YouTube/LinkedIn lewat picker.
 */
async function upsertReplizAccount(
  c: Context,
  opts: {
    platform: OAuthPlatform;
    accountId: string;
    info: ReplizAccount;
    stateRow: typeof oauthState.$inferSelect;
  },
): Promise<Response> {
  const { platform, accountId, info, stateRow } = opts;
  const env2 = (await import("@sahabatkreator/env/server")).env;
  // Upsert social account — replizAccountId di metadata (routing publish per-account)
  const [existing] = await db
    .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.platform, platform),
        eq(socialAccount.platformAccountId, info.generatedId),
      ),
    )
    .limit(1);

  if (existing && existing.organizationId !== stateRow.organizationId) {
    return c.redirect(
      `${env2.WEB_URL}/accounts?connect_error=${encodeURIComponent("Akun ini sudah terhubung di organisasi lain.")}`,
    );
  }

  const values = {
    username: info.username ?? info.name,
    displayName: info.name,
    avatarUrl: info.picture ?? null,
    // Tidak ada platform token di sisi kita — Repliz yang menyimpannya.
    accessTokenEnc: null,
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    isConnected: true,
    needsReconnect: false,
    lastError: null,
    metadata: {
      replizAccountId: accountId,
      replizGeneratedId: info.generatedId,
    },
    lastSyncedAt: new Date(),
  };

  if (existing) {
    await db.update(socialAccount).set(values).where(eq(socialAccount.id, existing.id));
    fireActivity({
      orgId: stateRow.organizationId,
      userId: stateRow.userId,
      action: "account.reconnected",
      targetType: "social_account",
      targetId: existing.id,
      metadata: { platform, username: info.username, via: "repliz" },
    });
  } else {
    const id = generateId("socacc");
    await db.insert(socialAccount).values({
      id,
      organizationId: stateRow.organizationId,
      platform,
      platformAccountId: info.generatedId,
      ...values,
    });
    fireActivity({
      orgId: stateRow.organizationId,
      userId: stateRow.userId,
      action: "account.connected",
      targetType: "social_account",
      targetId: id,
      metadata: { platform, username: info.username, via: "repliz" },
    });
  }

  return c.redirect(`${env2.WEB_URL}/accounts?connect_success=${platform}`);
}

/**
 * POST /oauth/bluesky/connect — Bluesky via app password (input manual, bukan OAuth redirect).
 * Body: { handle, appPassword }
 */
oauthRoute.post("/bluesky/connect", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    const input = z
      .object({
        handle: z.string().min(3).max(200),
        appPassword: z.string().min(8).max(200),
      })
      .parse(await c.req.json());

    // Validasi kredensial: createSession di PDS
    const pds = env.BLUESKY_PDS_URL || "https://bsky.social";
    const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: input.handle,
        password: input.appPassword,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return c.json({ message: `Login Bluesky gagal: ${text.slice(0, 200) || res.status}` }, 400);
    }
    const session = (await res.json()) as {
      did?: string;
      handle?: string;
      email?: string;
      accessJwt?: string;
    };
    if (!session.did) {
      return c.json({ message: "Bluesky tidak mengembalikan DID" }, 400);
    }

    // Avatar profil — getProfile pakai accessJwt dari session (best effort)
    let avatarUrl: string | null = null;
    if (session.accessJwt) {
      try {
        const profRes = await fetch(
          `${pds}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`,
          { headers: { Authorization: `Bearer ${session.accessJwt}` } },
        );
        if (profRes.ok) {
          const prof = (await profRes.json()) as { avatar?: string };
          avatarUrl = prof.avatar ?? null;
        }
      } catch {
        // best effort — akun tetap tersambung tanpa avatar
      }
    }

    // Upsert akun — app password disimpan sebagai "accessToken" (dipakai adapter createSession)
    const [existing] = await db
      .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.platform, "bluesky"),
          eq(socialAccount.platformAccountId, session.did),
        ),
      )
      .limit(1);

    if (existing && existing.organizationId !== ctx.organization.id) {
      return c.json({ message: "Akun ini sudah terhubung di organisasi lain." }, 409);
    }

    if (existing) {
      await db
        .update(socialAccount)
        .set({
          username: session.handle ?? input.handle,
          avatarUrl,
          accessTokenEnc: encrypt(input.appPassword),
          isConnected: true,
          lastError: null,
          lastSyncedAt: new Date(),
        })
        .where(eq(socialAccount.id, existing.id));

      // Catat aktivitas org: Bluesky di-reconnect
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: "account.reconnected",
        targetType: "social_account",
        targetId: existing.id,
        metadata: { platform: "bluesky", username: session.handle ?? input.handle },
      });
    } else {
      const blueskyId = generateId("socacc");
      await db.insert(socialAccount).values({
        id: blueskyId,
        organizationId: ctx.organization.id,
        platform: "bluesky",
        platformAccountId: session.did,
        username: session.handle ?? input.handle,
        avatarUrl,
        accessTokenEnc: encrypt(input.appPassword),
        scopes: ["app_password"],
        isConnected: true,
        lastSyncedAt: new Date(),
      });

      // Catat aktivitas org: Bluesky terhubung
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: "account.connected",
        targetType: "social_account",
        targetId: blueskyId,
        metadata: { platform: "bluesky", username: session.handle ?? input.handle },
      });
    }

    return c.json({ ok: true, handle: session.handle ?? input.handle }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /oauth/:platform/refresh — refresh token akun manual (dipakai sebelum publish
 * bila token hampir expired; worker juga bisa memanggil).
 */
oauthRoute.post("/:platform/refresh", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const platform = c.req.param("platform") as OAuthPlatform;
    if (!isOAuthPlatformSupported(platform)) {
      return c.json({ message: "Platform tidak didukung" }, 400);
    }

    const input = z.object({ accountId: z.string() }).parse(await c.req.json());

    const [account] = await db
      .select()
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.id, input.accountId),
          eq(socialAccount.organizationId, ctx.organization.id),
          eq(socialAccount.platform, platform),
        ),
      )
      .limit(1);
    if (!account) return c.json({ message: "Akun tidak ditemukan" }, 404);

    const { decrypt } = await import("../lib/crypto");
    const refreshToken = account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : null;
    if (!refreshToken) {
      return c.json({ message: "Akun tidak punya refresh token — hubungkan ulang." }, 400);
    }

    const cred = await getAppCredential(platform);
    const token = await exchangeRefresh(platform, cred, refreshToken);

    await db
      .update(socialAccount)
      .set({
        accessTokenEnc: encrypt(token.accessToken),
        refreshTokenEnc: encrypt(token.refreshToken!),
        tokenExpiresAt: token.expiresAt ?? null,
        lastSyncedAt: new Date(),
        lastError: null,
      })
      .where(eq(socialAccount.id, account.id));

    return c.json({ ok: true, expiresAt: token.expiresAt ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /oauth/:platform/revoke — cabut token & hapus akun social media.
 * Dibutuhkan Meta/Google App Review: app harus handle token revocation.
 */
oauthRoute.post("/:platform/revoke", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const platform = c.req.param("platform") as OAuthPlatform;
    if (!isOAuthPlatformSupported(platform)) {
      return c.json({ message: "Platform tidak didukung" }, 400);
    }

    const input = z.object({ accountId: z.string() }).parse(await c.req.json());

    const [account] = await db
      .select()
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.id, input.accountId),
          eq(socialAccount.organizationId, ctx.organization.id),
          eq(socialAccount.platform, platform),
        ),
      )
      .limit(1);
    if (!account) return c.json({ message: "Akun tidak ditemukan" }, 404);

    const { decrypt } = await import("../lib/crypto");
    // Akun tanpa access token tersimpan (mis. sumber manual / refresh-only) —
    // tidak ada yang bisa direvoke, langsung hapus dari DB
    const accessToken = account.accessTokenEnc ? decrypt(account.accessTokenEnc) : null;

    // Revoke token di platform (best effort — failure tidak memblokir penghapusan DB)
    try {
      const cred = await getAppCredential(platform);
      const revokeUrls: Record<string, string> = {
        meta: `${GRAPH_FB_URL}/me/permissions`,
        instagram: `${GRAPH_FB_URL}/me/permissions`,
        instagram_standalone: `${GRAPH_FB_URL}/me/permissions`,
        threads: GRAPH_THREADS_REVOKE_URL,
        tiktok: `${TIKTOK_OPEN_API_URL}/oauth/revoke/`,
        youtube: GOOGLE_OAUTH_REVOKE_URL,
        google_business: GOOGLE_OAUTH_REVOKE_URL,
        pinterest: `${PINTEREST_API_BASE_URL}/oauth/token`,
        linkedin: LINKEDIN_OAUTH_REVOKE_URL,
        linkedin_org: LINKEDIN_OAUTH_REVOKE_URL,
      };
      const revokeUrl = revokeUrls[platform];
      if (revokeUrl && accessToken) {
        const body: Record<string, string> = {};
        if (platform === "tiktok") {
          body.client_key = cred.clientId;
          body.client_secret = cred.clientSecret;
          body.token = accessToken;
        } else if (platform === "youtube" || platform === "google_business") {
          // Google revoke uses token in body
          body.token = accessToken;
        } else if (platform === "pinterest") {
          // Pinterest revoke via DELETE
          await fetch(revokeUrl, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          }).catch(() => {});
        } else {
          // Meta, Threads, LinkedIn — token di query/header
          body.access_token = accessToken;
        }
        if (platform !== "pinterest") {
          await fetch(revokeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(body).toString(),
          }).catch(() => {});
        }
      }
    } catch {
      // Best effort — lanjut hapus dari DB
    }

    // Hapus dari DB
    await db.delete(socialAccount).where(eq(socialAccount.id, account.id));

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

async function exchangeRefresh(platform: OAuthPlatform, cred: AppCredential, refreshToken: string) {
  const { refreshAccessToken } = await import("@sahabatkreator/publishing");
  return refreshAccessToken(platform, cred, refreshToken);
}
