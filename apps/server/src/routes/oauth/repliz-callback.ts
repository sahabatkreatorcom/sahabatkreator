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
import {
  logRedirectHit,
  logReplizResponse,
  maskSecret,
} from "../../lib/repliz-oauth-debug";

/**
 * GET /oauth/:platform/repliz-callback/:state — callback dari halaman Repliz setelah
 * user approve OAuth di platform (via app milik Repliz). Terbukti via spike: browser
 * tiba di path redirect utuh dengan ?code=<repliz exchange code> ditambahkan Repliz
 * (state kita di path karena validasi redirect Repliz menolak query string).
 * Flow: exchange code → token Repliz → (FB: get-page → picker) → connect → accountId.
 */
export async function handleReplizCallback(c: Context): Promise<Response> {
  const platform = c.req.param("platform") as OAuthPlatform;
  const failRedirect = (msg: string) =>
    c.redirect(`${env.WEB_URL}/accounts?connect_error=${encodeURIComponent(msg)}`);

  try {
    if (!isOAuthPlatformSupported(platform)) {
      return failRedirect("Platform tidak didukung");
    }

    // [DEBUG] Log APA SAJA yang dilihat server saat Repliz melempar redirect
    // kembali ke callback. Jika token tidak muncul di query/header di sini,
    // kemungkinan besar Repliz meletakkannya di URL fragment (#token=…)
    // yang HANYA bisa dibaca browser, bukan server.
    logRedirectHit(platform, {
      path: c.req.path,
      query: c.req.query(),
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    });

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
    // - linkedin:     exchange → get-organization → filter person  → picker → connect
    // - linkedin_org: exchange → get-organization → filter company  → picker → connect
    //   (keduanya connect({ organizationId, token }) — beda hanya URN type)
    if (
      platform === "instagram" ||
      platform === "instagram_standalone" ||
      platform === "threads" ||
      platform === "tiktok"
    ) {
      const { replizConnectAccount, replizGetAccount } = await import("@sahabatkreator/publishing");
      // [DEBUG] jalur single-entity: kirim { code } ke Repliz connect
      console.info(
        `[repliz-oauth] connect [${platform}] kirim body { code: ${maskSecret(code)} }`,
      );
      const accountId = await replizConnectAccount(cred, platformKey, { code });
      const info = await replizGetAccount(cred, accountId);
      return await upsertReplizAccount(c, { platform, accountId, info, stateRow });
    }

    // 1. Exchange code → token Repliz (token user-level platform, short-lived)
    const token = await replizExchangeCode(cred, platformKey, code);
    // [DEBUG] apakah exchange benar-benar mengembalikan token?
    logReplizResponse(
      `exchange [${platform}]`,
      Boolean(token),
      `token=${maskSecret(token)}`,
    );

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
      // [DEBUG] token per-entity ada/tidak — ini yg dikirim ke connect nanti
      console.info(
        `[repliz-oauth] entity [${platform}] ${entities.length} item:\n` +
          entities
            .map(
              (p) =>
                `  - ${p.name} (${p.id}) token=${p.token ? maskSecret(p.token) : "(TIDAK ADA)"}`,
            )
            .join("\n"),
      );
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
}

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
