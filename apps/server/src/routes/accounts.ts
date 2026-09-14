// API Social Accounts — connect/disconnect akun social media

import { db } from "@sahabatkreator/db";
import {
  oauthPendingSelection,
  type PendingPageData,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";
import { decrypt } from "../lib/crypto";
import { generateId } from "../lib/id";
import { upsertSocialAccount } from "../lib/oauth-connect";

export const accountsRoute = new Hono();

/** GET /accounts — list akun sosmed org */
accountsRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
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
        createdAt: socialAccount.createdAt,
      })
      .from(socialAccount)
      .where(eq(socialAccount.organizationId, ctx.organization.id));
    return c.json({ accounts });
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
    const ctx = await requireOrg(c);
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
 * GET /accounts/pending/:id — daftar entitas hasil OAuth multi-entity (untuk picker UI).
 * Token TIDAK dikirim — hanya id, nama, dan info IG bisnis / tipe profil LinkedIn.
 */
accountsRoute.get("/pending/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select()
      .from(oauthPendingSelection)
      .where(eq(oauthPendingSelection.id, c.req.param("id")))
      .limit(1);
    if (!row || row.userId !== ctx.user.id) {
      return c.json({ message: "Data pemilihan akun tidak ditemukan" }, 404);
    }
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
    return c.json({
      platform: row.platform,
      pages: pages.map((p) => ({
        pageId: p.pageId,
        pageName: p.pageName,
        hasInstagram: Boolean(p.igUserId),
        igUsername: p.igUsername,
        // LinkedIn: profil pribadi vs company (deteksi dari prefix URN)
        isPersonal: row.platform === "linkedin" && p.pageId.startsWith("urn:li:person:"),
      })),
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
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    const input = z.object({ pageId: z.string().min(1) }).parse(await c.req.json());

    const [row] = await db
      .select()
      .from(oauthPendingSelection)
      .where(eq(oauthPendingSelection.id, c.req.param("id")))
      .limit(1);
    if (!row || row.userId !== ctx.user.id) {
      return c.json({ message: "Data pemilihan akun tidak ditemukan" }, 404);
    }
    if (row.expiresAt < new Date()) {
      await db.delete(oauthPendingSelection).where(eq(oauthPendingSelection.id, row.id));
      return c.json({ message: "Sesi pemilihan akun kedaluwarsa — hubungkan ulang" }, 410);
    }
    if (row.organizationId !== ctx.organization.id) {
      return c.json({ message: "Pemilihan akun milik organisasi lain" }, 403);
    }
    if (
      row.platform !== "instagram" &&
      row.platform !== "facebook" &&
      row.platform !== "youtube" &&
      row.platform !== "linkedin" &&
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
    const page = pages.find((p) => p.pageId === input.pageId);
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
      (row.platform === "facebook" || row.platform === "youtube" || row.platform === "linkedin")
    ) {
      const { getReplizCredentials, toReplizPlatformKey } = await import("../lib/bridge");
      const cred = await getReplizCredentials();
      if (!cred) return c.json({ message: "Bridge Repliz tidak aktif" }, 400);

      const { replizConnectAccount, replizGetAccount } = await import("@sahabatkreator/publishing");
      const platformKey = toReplizPlatformKey(row.platform);
      if (!platformKey) return c.json({ message: "Platform tidak didukung bridge" }, 400);
      const entityToken = decrypt(page.pageAccessTokenEnc);
      // Body connect berbeda per platform (docs.repliz.com):
      // facebook {pageId, token} / youtube {channelId, token} / linkedin {organizationId, token}
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
        needsReconnect: false,
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

/** DELETE /accounts/:id — disconnect akun */
accountsRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
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
