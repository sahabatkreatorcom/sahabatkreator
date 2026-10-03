// API Social Accounts — connect/disconnect akun social media

import { db } from "@sahabatkreator/db";
import {
  oauthPendingSelection,
  type PendingPageData,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { clearAccessLostPatch, type OAuthPlatform } from "@sahabatkreator/publishing";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requirePermission } from "../lib/auth-guard";
import { checkFeatureGate, checkPlanFeature } from "../lib/billing";
import { decrypt } from "../lib/crypto";
import { assertAllowedRedirect, resolveDeveloperApp } from "../lib/developer-app";
import { generateId } from "../lib/id";
import { toPendingAssets, upsertSocialAccount } from "../lib/oauth-connect";
import { API_FEATURES } from "../lib/public-api";
import { connectWithCode } from "./oauth/connect";
import { startOAuthFlow } from "./oauth/start";

export const accountsRoute = new Hono();

/**
 * Tegakkan gate plan `api_write` untuk endpoint GET di jalur API.
 *
 * MENGAPA manual: `publicApiPlanGate` hanya menuntut `API_FEATURES.write` untuk
 * method non-safe (`SAFE_METHODS` di lib/public-api.ts memuat `GET`), jadi GET
 * yang secara semantik bagian dari alur tulis akan bocor ke plan Pro. Hanya
 * berlaku bila request datang lewat API key — jalur UI (sesi) tidak terpengaruh,
 * karena `c.get("apiKey")` kosong di sana.
 */
async function enforceApiWriteGate(c: Context): Promise<void> {
  const key = c.get("apiKey");
  if (key) await checkPlanFeature(key.organizationId, API_FEATURES.write);
}

/** GET /accounts — list akun sosmed org */
accountsRoute.get("/", async (c) => {
  try {
    const ctx = await requirePermission(c, "accounts.view");
    const accounts = await db
      .select({
        id: socialAccount.id,
        platform: socialAccount.platform,
        platformAccountId: socialAccount.platformAccountId,
        username: socialAccount.username,
        displayName: socialAccount.displayName,
        avatarUrl: socialAccount.avatarUrl,
        isConnected: socialAccount.isConnected,
        needsReconnect: socialAccount.needsReconnect,
        lastSyncedAt: socialAccount.lastSyncedAt,
        lastError: socialAccount.lastError,
        tokenExpiresAt: socialAccount.tokenExpiresAt,
        hasRefreshToken: isNotNull(socialAccount.refreshTokenEnc),
        createdAt: socialAccount.createdAt,
        metadata: socialAccount.metadata,
      })
      .from(socialAccount)
      .where(eq(socialAccount.organizationId, ctx.organization.id));
    return c.json({
      accounts: accounts.map((a) => ({
        ...a,
        // Flag terderivasi (bukan ekspos metadata mentah) — UI perlu tahu routing
        // publish: akun bridge lewat Repliz, batasan fitur berbeda dgn API native.
        isBridge: Boolean(a.metadata?.replizAccountId),
        metadata: undefined,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

const connectManualSchema = z.object({
  platform: z.literal("manual"),
  username: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200).optional(),
});

/**
 * POST /accounts/connect-manual — tambah akun platform manual (reminder-only).
 * Platform lain connect via OAuth callback per platform (TODO setelah API access disetujui).
 */
accountsRoute.post("/connect-manual", async (c) => {
  try {
    const ctx = await requirePermission(c, "accounts.connect");
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    const input = connectManualSchema.parse(await c.req.json());
    const id = generateId("socacc");
    await db.insert(socialAccount).values({
      id,
      organizationId: ctx.organization.id,
      platform: "manual",
      platformAccountId: `manual:${ctx.organization.id}:${input.username}`,
      username: input.username,
      displayName: input.displayName ?? input.username,
      isConnected: true,
    });
    const [row] = await db.select().from(socialAccount).where(eq(socialAccount.id, id));

    // Catat aktivitas org: akun manual ditambahkan
    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "account.connected",
      targetType: "social_account",
      targetId: id,
      metadata: { platform: "manual", username: input.username },
    });

    return c.json({ account: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /accounts/:platform/authorize?redirect=<uri> — mulai OAuth flow untuk
 * developer (jalur API connect akun, docs/rfc-oauth-connect.md §5.2).
 *
 * HANYA untuk key API yang terikat `developer_app`: tanpa app tidak ada
 * allowlist redirect, jadi tidak ada tujuan yang bisa dipercaya untuk
 * mengembalikan `code`.
 *
 * MENGAPA gate `api_write` ditegakkan MANUAL di sini: `publicApiPlanGate` hanya
 * menuntut `api_write` untuk method non-safe (`SAFE_METHODS` di lib/public-api.ts),
 * sementara endpoint ini GET. Tanpa pemeriksaan eksplisit, connect akun lewat API
 * akan terbuka untuk plan yang tidak punya `api_write` — bertentangan dengan
 * maksud §5.2 ("semua endpoint connect terkunci Business/Enterprise").
 */
accountsRoute.get("/:platform/authorize", async (c) => {
  try {
    const key = c.get("apiKey");
    if (!key) {
      return c.json({ message: "Endpoint ini hanya untuk API key." }, 403);
    }
    await enforceApiWriteGate(c);

    const app = await resolveDeveloperApp(key.developerAppId, key.organizationId);
    if (!app) {
      return c.json({ message: "API key ini belum terhubung ke developer app yang aktif." }, 403);
    }

    const redirect = c.req.query("redirect");
    if (!redirect) return c.json({ message: "Parameter redirect wajib diisi." }, 400);
    const redirectUri = assertAllowedRedirect(app, redirect);

    // State ditandai milik app → callback berhenti jadi proxy (tidak connect).
    return startOAuthFlow(c, { developerAppId: app.id, redirectUri });
  } catch (error) {
    return errorResponse(error);
  }
});

const connectBodySchema = z.object({ code: z.string().min(1) });

/**
 * POST /accounts/:platform/connect & /exchange — tukar `code` menjadi akun.
 *
 * Respons POLIMORFIK (docs/rfc-oauth-connect.md §4.3):
 *   { accountId }                   → selesai, akun sudah terhubung
 *   { pendingId, assets: [...] }    → platform butuh pemilihan aset dulu
 *
 * TIDAK ada 400 untuk platform asset-selection: daftar platform yang butuh
 * picker adalah detail internal yang berubah setiap kali approval platform
 * turun (native ↔ bridge), jadi tidak boleh bocor ke kontrak publik.
 *
 * MENGAPA `connect` dan `exchange` memakai handler yang sama: pada platform
 * asset-selection, `connect` pun tidak langsung menghubungkan — ia mengembalikan
 * `pendingId`. Jadi tidak ada perilaku berbeda yang bisa dijanjikan; `exchange`
 * hanya ada supaya developer yang ingin menampilkan picker lebih awal punya
 * endpoint yang jelas. `code` tetap sekali pakai di sisi platform: panggil salah
 * satu, bukan keduanya.
 */
async function handleConnectWithCode(c: Context): Promise<Response> {
  try {
    const ctx = await requirePermission(c, "accounts.connect");
    const platform = c.req.param("platform") as OAuthPlatform;
    const { code } = connectBodySchema.parse(await c.req.json());

    const result = await connectWithCode({
      platform,
      code,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
    });

    switch (result.kind) {
      case "connected":
        return c.json({ accountId: result.accountId });
      case "pending":
        return c.json({ pendingId: result.pendingId, assets: result.assets });
      case "conflict":
        // Satu akun platform hanya boleh dimiliki satu org supaya publish tidak bentrok.
        return c.json({ message: "Akun ini sudah terhubung di organisasi lain." }, 409);
      case "error":
        return c.json({ message: result.message }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}

accountsRoute.post("/:platform/connect", handleConnectWithCode);
accountsRoute.post("/:platform/exchange", handleConnectWithCode);

/**
 * GET /accounts/pending/:id — daftar entitas hasil OAuth multi-entity (untuk picker UI).
 * Token TIDAK dikirim — hanya id, nama, dan info IG bisnis / tipe profil LinkedIn.
 *
 * Dipakai jalur UI *dan* `/v1/accounts/pending/:id`. Karena ini GET (method safe),
 * `publicApiPlanGate` tidak menuntut `api_write` — jadi gate-nya ditegakkan
 * manual untuk request ber-API-key.
 */
accountsRoute.get("/pending/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "accounts.view");
    await enforceApiWriteGate(c);
    const [row] = await db
      .select()
      .from(oauthPendingSelection)
      .where(eq(oauthPendingSelection.id, c.req.param("id")))
      .limit(1);
    if (!row) {
      return c.json({ message: "Data pemilihan akun tidak ditemukan" }, 404);
    }
    // Otorisasi berbasis ORGANISASI, bukan user pembuat flow (RFC §11 #1).
    // Jalur API: "user" = pembuat API key, jadi `row.userId !== ctx.user.id` gagal
    // begitu key dirotasi atau pembuatnya keluar dari org — alur picker putus.
    // Cek organisasi juga LEBIH KETAT: user yang menjadi anggota >1 organisasi
    // tidak lagi bisa membaca pending org lain hanya karena userId-nya sama.
    if (row.organizationId !== ctx.organization.id) {
      return c.json({ message: "Pemilihan akun milik organisasi lain" }, 403);
    }
    // Urutannya penting: cek organisasi SEBELUM cabang kedaluwarsa, karena cabang
    // itu MENGHAPUS baris — jangan sampai org lain bisa menghapus pending kita.
    if (row.expiresAt < new Date()) {
      await db.delete(oauthPendingSelection).where(eq(oauthPendingSelection.id, row.id));
      return c.json({ message: "Sesi pemilihan akun kedaluwarsa — hubungkan ulang" }, 410);
    }
    let pages: PendingPageData[];
    try {
      pages = JSON.parse(row.pagesData) as PendingPageData[];
    } catch {
      return c.json({ message: "Data pilihan korup — hubungkan ulang" }, 410);
    }
    // Bentuk aset diproyeksikan oleh `toPendingAssets` — SATU sumber yang sama
    // dengan `assets[]` di `POST /connect` (RFC §11 #7). Sebelumnya route ini
    // memetakan sendiri, jadi bentuknya menyimpang dari respons connect.
    return c.json({
      platform: row.platform,
      assets: toPendingAssets(pages, row.platform),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /accounts/pending/:id/select — hubungkan entitas terpilih (Page Meta / profil LinkedIn).
 * Hapus pending setelah insert; satu pending = satu entitas (pilih ulang = connect ulang).
 */
accountsRoute.post("/pending/:id/select", async (c) => {
  try {
    const ctx = await requirePermission(c, "accounts.connect");
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    // `assetId` (bukan `pageId`): asetnya bisa board/channel/profil, bukan hanya
    // Page — dan nilainya persis `assets[].id` yang dikembalikan `GET /pending/:id`
    // (RFC §11 #7). Satu kosakata untuk baca dan tulis.
    const input = z.object({ assetId: z.string().min(1) }).parse(await c.req.json());

    const [row] = await db
      .select()
      .from(oauthPendingSelection)
      .where(eq(oauthPendingSelection.id, c.req.param("id")))
      .limit(1);
    if (!row) {
      return c.json({ message: "Data pemilihan akun tidak ditemukan" }, 404);
    }
    // Otorisasi berbasis ORGANISASI (RFC §11 #1) — lihat catatan di GET /pending/:id.
    // Kuota TIDAK terpengaruh: `checkFeatureGate` di atas memakai organisasi dari
    // konteks auth, dan akunnya juga di-insert ke organisasi yang sama, jadi org
    // yang ditagih selalu org yang sama dengan pemilik pending.
    if (row.organizationId !== ctx.organization.id) {
      return c.json({ message: "Pemilihan akun milik organisasi lain" }, 403);
    }
    // Cek organisasi SEBELUM cabang kedaluwarsa — cabang itu menghapus baris.
    if (row.expiresAt < new Date()) {
      await db.delete(oauthPendingSelection).where(eq(oauthPendingSelection.id, row.id));
      return c.json({ message: "Sesi pemilihan akun kedaluwarsa — hubungkan ulang" }, 410);
    }
    if (
      row.platform !== "instagram" &&
      row.platform !== "facebook" &&
      row.platform !== "youtube" &&
      row.platform !== "linkedin" &&
      row.platform !== "linkedin_org" &&
      row.platform !== "pinterest"
    ) {
      return c.json({ message: "Platform tidak mendukung pemilihan multi-akun" }, 400);
    }

    let pages: PendingPageData[];
    try {
      pages = JSON.parse(row.pagesData) as PendingPageData[];
    } catch {
      return c.json({ message: "Data pilihan korup — hubungkan ulang" }, 410);
    }
    const page = pages.find((p) => p.pageId === input.assetId);
    if (!page) return c.json({ message: "Akun tidak ada dalam daftar" }, 400);

    // Instagram flow wajib punya IG business account di Page terpilih
    if (row.platform === "instagram" && !page.igUserId) {
      return c.json(
        { message: "Page ini tidak punya Instagram Business terhubung — pilih Page lain" },
        400,
      );
    }

    // Flow bridge Repliz: entity token di pending adalah token dari get-page/channel/org.
    // Connect entity terpilih ke workspace Repliz → simpan replizAccountId di metadata.
    if (
      row.pagesData.includes("replizBridge") &&
      (row.platform === "facebook" ||
        row.platform === "youtube" ||
        row.platform === "linkedin" ||
        row.platform === "linkedin_org")
    ) {
      const { getReplizCredentials, toReplizPlatformKey } = await import("../lib/bridge");
      const cred = await getReplizCredentials();
      if (!cred) return c.json({ message: "Bridge Repliz tidak aktif" }, 400);

      const { replizConnectAccount, replizGetAccount } = await import("@sahabatkreator/publishing");
      const platformKey = toReplizPlatformKey(row.platform);
      if (!platformKey) return c.json({ message: "Platform tidak didukung bridge" }, 400);
      const entityToken = decrypt(page.pageAccessTokenEnc);
      // Body connect berbeda per platform (docs.repliz.com):
      // facebook {pageId, token} / youtube {channelId, token} /
      // linkedin & linkedin_org {organizationId, token} — Repliz menerima URN
      // person maupun organization di field yg sama.
      const connectInput =
        row.platform === "facebook"
          ? { pageId: page.pageId, token: entityToken }
          : row.platform === "youtube"
            ? { channelId: page.pageId, token: entityToken }
            : { organizationId: page.pageId, token: entityToken };
      const accountId = await replizConnectAccount(cred, platformKey, connectInput);
      const info = await replizGetAccount(cred, accountId);

      const [existingRepliz] = await db
        .select({ id: socialAccount.id, organizationId: socialAccount.organizationId })
        .from(socialAccount)
        .where(
          and(
            eq(socialAccount.platform, row.platform),
            eq(socialAccount.platformAccountId, info.generatedId),
          ),
        )
        .limit(1);
      if (existingRepliz && existingRepliz.organizationId !== ctx.organization.id) {
        return c.json({ message: "Akun ini sudah terhubung di organisasi lain." }, 409);
      }

      const values = {
        username: info.username ?? info.name,
        displayName: info.name,
        avatarUrl: info.picture ?? null,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
        isConnected: true,
        ...clearAccessLostPatch(),
        lastError: null,
        metadata: {
          replizAccountId: accountId,
          replizGeneratedId: info.generatedId,
          entityId: page.pageId, // pageId FB / channelId YT / organizationId LinkedIn
        },
        lastSyncedAt: new Date(),
      };
      if (existingRepliz) {
        await db.update(socialAccount).set(values).where(eq(socialAccount.id, existingRepliz.id));
      } else {
        await db.insert(socialAccount).values({
          id: generateId("socacc"),
          organizationId: ctx.organization.id,
          platform: row.platform,
          platformAccountId: info.generatedId,
          ...values,
        });
      }

      await db.delete(oauthPendingSelection).where(eq(oauthPendingSelection.id, row.id));
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: existingRepliz ? "account.reconnected" : "account.connected",
        targetType: "social_account",
        targetId: existingRepliz?.id ?? info.generatedId,
        metadata: { platform: row.platform, username: info.username, via: "repliz" },
      });
      return c.json({ ok: true, username: info.username ?? info.name });
    }

    const result = await upsertSocialAccount({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      platform: row.platform,
      page,
      userAccessToken: decrypt(page.pageAccessTokenEnc), // fallback FB; LinkedIn = token user-level
      tokenExpiresAt: null, // page token long-lived; LinkedIn expiry dari data pending
      scopes: [],
    });
    if (result.conflict) {
      return c.json({ message: "Akun ini sudah terhubung di organisasi lain." }, 409);
    }

    await db.delete(oauthPendingSelection).where(eq(oauthPendingSelection.id, row.id));

    // Catat aktivitas org: akun terhubung via picker
    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: result.existing ? "account.reconnected" : "account.connected",
      targetType: "social_account",
      targetId: page.pageId,
      metadata: { platform: row.platform, username: page.igUsername ?? page.pageName },
    });

    return c.json({
      ok: true,
      username:
        row.platform === "instagram" || row.platform === "pinterest"
          ? (page.igUsername ?? page.pageName)
          : page.pageName,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /accounts/:id/statistic — statistik agregat akun bridge Repliz
 * (follower/post/message count). 404 graceful: beberapa platform (FB page,
 * YouTube channel) tidak support → return null. */
accountsRoute.get("/:id/statistic", async (c) => {
  try {
    const ctx = await requirePermission(c, "accounts.view");
    const [row] = await db
      .select({ metadata: socialAccount.metadata })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.id, c.req.param("id")),
          eq(socialAccount.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Akun tidak ditemukan" }, 404);

    const replizAccountId = (row.metadata as { replizAccountId?: string } | null)?.replizAccountId;
    if (!replizAccountId) {
      return c.json({ message: "Akun ini tidak terhubung via bridge Repliz" }, 400);
    }
    const { getReplizCredentials } = await import("../lib/bridge");
    const cred = await getReplizCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const { replizGetAccountStatistic } = await import("@sahabatkreator/publishing");
    try {
      return c.json({ statistic: await replizGetAccountStatistic(cred, replizAccountId) });
    } catch (err) {
      // 404 = platform tidak support statistic (FB page/YouTube channel) — bukan error
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.includes("not found")) {
        return c.json({ statistic: null, unsupported: true });
      }
      throw err;
    }
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /accounts/:id — disconnect akun */
accountsRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "accounts.disconnect");
    const [row] = await db
      .select()
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.id, c.req.param("id")),
          eq(socialAccount.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Akun tidak ditemukan" }, 404);

    // Akun via bridge Repliz: hapus juga di workspace Repliz supaya slot limit
    // (200 akun Gold) tidak terbuang dan token user benar-benar dicabut.
    if (row.metadata?.replizAccountId) {
      const { getReplizCredentials } = await import("../lib/bridge");
      const cred = await getReplizCredentials();
      if (cred) {
        try {
          const { replizRemoveAccount } = await import("@sahabatkreator/publishing");
          await replizRemoveAccount(cred, String(row.metadata.replizAccountId));
        } catch (err) {
          // Jangan gagalkan disconnect lokal — log & lanjut (admin bisa bersihkan manual di Repliz)
          console.error(
            `[accounts] Gagal hapus akun Repliz ${String(row.metadata.replizAccountId)}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    await db.delete(socialAccount).where(eq(socialAccount.id, row.id));

    // Catat aktivitas org: akun diputus/disconnect
    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "account.disconnected",
      targetType: "social_account",
      targetId: row.id,
      metadata: { platform: row.platform, username: row.username },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
