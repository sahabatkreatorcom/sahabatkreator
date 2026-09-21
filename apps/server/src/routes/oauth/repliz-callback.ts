// GET /oauth/:platform/repliz-callback/:state — callback dari halaman Repliz.

import { db } from "@sahabatkreator/db";
import { oauthPendingSelection, oauthState, socialAccount } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  isOAuthPlatformSupported,
  type OAuthPlatform,
  type ReplizAccount,
  replizExchangeCode,
  replizGetFacebookPages,
  replizGetLinkedInOrganizations,
  replizGetYouTubeChannels,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { fireActivity } from "../../lib/activity-log";
import { getReplizCredentials, toReplizPlatformKey } from "../../lib/bridge";
import { encrypt } from "../../lib/crypto";
import { generateId } from "../../lib/id";

/**
 * GET  /oauth/:platform/repliz-callback/:state — callback dari halaman Repliz setelah
 * user approve OAuth di platform (via app milik Repliz). Browser tiba di path redirect
 * utuh dengan ?code=<repliz exchange code> ditambahkan Repliz (state kita di path
 * karena validasi redirect Repliz menolak query string).
 * Flow: exchange code → token Repliz → (FB: get-page → picker) → connect → accountId.
 *
 * POST /oauth/:platform/repliz-callback/:state — varian untuk flow "fragment":
 * Facebook mengembalikan token di URL FRAGMENT (#access_token=…) yang TIDAK PERNAH
 * dikirim ke server (docs Repliz: "read it in the browser with window.location.hash
 * and pass the value to your backend"). Frontend page /oauth/repliz-fragment/…
 * mengekstrak fragment lalu POST code ke endpoint ini. Response JSON { redirect }
 * (bukan 302) agar frontend bisa navigasi.
 */
export async function handleReplizCallback(c: Context): Promise<Response> {
  const platform = c.req.param("platform") as OAuthPlatform;
  const isPost = c.req.method === "POST";
  // POST (fragment flow) → response JSON { redirect }; GET → 302 redirect biasa.
  const failRedirect = (msg: string) =>
    isPost
      ? c.json({ redirect: `${env.WEB_URL}/accounts?connect_error=${encodeURIComponent(msg)}` })
      : c.redirect(`${env.WEB_URL}/accounts?connect_error=${encodeURIComponent(msg)}`);

  try {
    if (!isOAuthPlatformSupported(platform)) {
      return failRedirect("Platform tidak didukung");
    }

    // GET: code di query (?code=…). POST: code di body (dari halaman fragment
    // browser — baca baik #access_token=… maupun ?code=…).
    const body = isPost ? await c.req.json().catch(() => ({})) : {};
    const code = isPost ? body.code : c.req.query("code");
    const state = c.req.param("state");
    const errorParam = c.req.query("error_description") ?? c.req.query("error");
    if (errorParam) return failRedirect(errorParam);
    if (!code || !state) return failRedirect("Kode otorisasi tidak lengkap");

    // Shopee mengembalikan code + shop_id terpisah di redirect; Repliz connect
    // butuh keduanya digabung "{code}_{shop_id}" (docs "Connect Shopee").
    const shopeeShopId = isPost ? (body.shopId ?? null) : c.req.query("shop_id");

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
    // - linkedin:     exchange → get-organization → filter person  → picker → connect
    // - linkedin_org: exchange → get-organization → filter company  → picker → connect
    //   (keduanya connect({ organizationId, token }) — beda hanya URN type)
    if (
      platform === "instagram" ||
      platform === "instagram_standalone" ||
      platform === "threads" ||
      platform === "tiktok" ||
      platform === "shopee"
    ) {
      const { replizConnectAccount, replizGetAccount } = await import("@sahabatkreator/publishing");
      // Shopee: code_{shop_id}; platform lain: code mentah.
      const connectCode =
        platform === "shopee" && shopeeShopId ? `${code}_${shopeeShopId}` : code;
      const accountId = await replizConnectAccount(cred, platformKey, { code: connectCode });
      const info = await replizGetAccount(cred, accountId);
      return await upsertReplizAccount(c, { platform, accountId, info, stateRow });
    }

    // 1. Exchange code → token Repliz (token user-level platform, short-lived)
    const token = await replizExchangeCode(cred, platformKey, code);

    // 2. Multi-entity (FB Page / channel YouTube / profil LinkedIn): picker dulu.
    //    Simpan pending selection (entity token terenkripsi), user pilih.
    if (
      platform === "facebook" ||
      platform === "youtube" ||
      platform === "linkedin" ||
      platform === "linkedin_org"
    ) {
      // Endpoint Repliz /public/account/linkedin/organization mengembalikan
      // personal (urn:li:person:) + company (urn:li:organization:) sekaligus.
      // Native memisahkan dua flow ini (app berbeda) — bridge harus konsisten:
      // filter sesuai flow yg dimulai user.
      const rawEntities =
        platform === "facebook"
          ? await replizGetFacebookPages(cred, token)
          : platform === "youtube"
            ? await replizGetYouTubeChannels(cred, token)
            : await replizGetLinkedInOrganizations(cred, token);
      const entities =
        platform === "linkedin"
          ? rawEntities.filter((p) => p.id.startsWith("urn:li:person:"))
          : platform === "linkedin_org"
            ? rawEntities.filter((p) => p.id.startsWith("urn:li:organization:"))
            : rawEntities;
      if (entities.length === 0) {
        return failRedirect(
          platform === "facebook"
            ? "Tidak ada Facebook Page yang bisa diakses akun ini"
            : platform === "youtube"
              ? "Tidak ada channel YouTube yang bisa diakses akun ini"
              : platform === "linkedin_org"
                ? "Tidak ada halaman company LinkedIn yang Anda admin"
                : "Tidak ada profil LinkedIn yang bisa dihubungkan",
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
      const pendingUrl = `${env.WEB_URL}/accounts?pending=${encodeURIComponent(pendingId)}`;
      return isPost ? c.json({ redirect: pendingUrl }) : c.redirect(pendingUrl);
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
}

/**
 * Simpan/refresh social_account hasil connect Repliz + redirect sukses.
 * Dipakai callback (platform single-entity) — FB/YouTube/LinkedIn lewat picker.
 * Method-aware: POST (fragment flow) → JSON { redirect }; GET → 302.
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
  const isPost = c.req.method === "POST";
  const respond = (url: string): Response =>
    isPost ? c.json({ redirect: url }) : c.redirect(url);
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
    return respond(
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

  return respond(`${env2.WEB_URL}/accounts?connect_success=${platform}`);
}
