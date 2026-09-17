// GET /oauth/:platform/callback — endpoint redirect dari platform.

import { db } from "@sahabatkreator/db";
import { oauthPendingSelection, oauthState, socialAccount } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  exchangeCodeForToken,
  fetchPlatformProfile,
  isOAuthPlatformSupported,
  type OAuthPlatform,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { fireActivity } from "../../lib/activity-log";
import { encrypt } from "../../lib/crypto";
import { generateId } from "../../lib/id";
import {
  buildPendingLinkedIn,
  buildPendingPages,
  buildPendingPinterest,
  type RawLinkedInOrganization,
  type RawMetaPage,
} from "../../lib/oauth-connect";
import { getAppCredential } from "./credentials";

/**
 * GET /oauth/:platform/callback — endpoint redirect dari platform.
 * Publik (platform tidak membawa cookie user). Validasi via state → org/user dari state row.
 */
export async function handleCallback(c: Context): Promise<Response> {
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
}
