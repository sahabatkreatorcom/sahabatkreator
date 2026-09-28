// POST /oauth/:platform/refresh — refresh token manual.
// POST /oauth/:platform/revoke — cabut token & hapus akun social media.

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import {
  GOOGLE_OAUTH_REVOKE_URL,
  GRAPH_FB_URL,
  GRAPH_THREADS_REVOKE_URL,
  isOAuthPlatformSupported,
  LINKEDIN_OAUTH_REVOKE_URL,
  type OAuthPlatform,
  PINTEREST_API_BASE_URL,
  TIKTOK_OPEN_API_URL,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../../lib/auth-guard";
import { encrypt } from "../../lib/crypto";
import { exchangeRefresh, getAppCredential } from "./credentials";

/**
 * POST /oauth/:platform/refresh — refresh token akun manual (dipakai sebelum publish
 * bila token hampir expired; worker juga bisa memanggil).
 */
export async function handleRefresh(c: Context): Promise<Response> {
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

    const { decrypt } = await import("../../lib/crypto");
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
}

/**
 * POST /oauth/:platform/revoke — cabut token & hapus akun social media.
 * Dibutuhkan Meta/Google App Review: app harus handle token revocation.
 */
export async function handleRevoke(c: Context): Promise<Response> {
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

    const { decrypt } = await import("../../lib/crypto");
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
}
