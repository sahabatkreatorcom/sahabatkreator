// GET /oauth/:platform/callback — endpoint redirect dari platform.
//
// DUA jalur berbagi endpoint ini:
//   1. UI Sahabat Kreator  — stateRow.developerAppId NULL. SK yang menyelesaikan
//      connect (exchange code → profil → pending picker atau langsung connect)
//      lalu redirect ke WEB_URL/accounts.
//   2. API developer       — stateRow.developerAppId terisi. SK hanya jadi PROXY:
//      code diteruskan apa adanya ke redirectUri milik developer, dan TIDAK
//      menyentuh akun sama sekali. Lihat docs/rfc-oauth-connect.md §5.3.

import { db } from "@sahabatkreator/db";
import { oauthState } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  exchangeCodeForToken,
  fetchPlatformProfile,
  isOAuthPlatformSupported,
  type OAuthPlatform,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { buildRedirectUrl } from "../../lib/developer-app";
import { buildPendingFromToken } from "../../lib/oauth-connect";
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

    // Platform mengembalikan error (mis. user menolak consent). Untuk jalur API
    // error HARUS sampai ke developer, bukan ke halaman /accounts kita — kalau
    // tidak, UI developer menggantung menunggu callback yang tidak pernah datang.
    // Lookup di sini sengaja read-only (state tidak dikonsumsi) supaya perilaku
    // jalur UI tidak berubah dari sebelumnya.
    if (errorParam) {
      if (state) {
        const [errState] = await db
          .select({
            developerAppId: oauthState.developerAppId,
            redirectUri: oauthState.redirectUri,
          })
          .from(oauthState)
          .where(and(eq(oauthState.state, state), eq(oauthState.platform, platform)))
          .limit(1);
        if (errState?.developerAppId && errState.redirectUri) {
          await db.delete(oauthState).where(eq(oauthState.state, state));
          return c.redirect(
            buildRedirectUrl(errState.redirectUri, {
              error: "access_denied",
              error_description: errorParam,
            }),
          );
        }
      }
      return failRedirect(errorParam);
    }

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

    // ── Jalur API: SK HANYA proxy ────────────────────────────────────────────
    // JANGAN exchange code, JANGAN connect, JANGAN buat pending. Developer yang
    // memutuskan kapan akun benar-benar dihubungkan (POST /v1/accounts/:p/connect,
    // fase 3), sehingga platform asset-selection bisa menampilkan picker-nya
    // sendiri dan kontraknya seragam dengan Repliz.
    //
    // State tetap DIHAPUS (baris di atas) meski code diteruskan: org sudah bisa
    // diresolusi dari API key di langkah connect (key terikat organisasi), jadi
    // state tidak dibutuhkan lagi — dan jaminan sekali-pakai tetap utuh.
    if (stateRow.developerAppId) {
      if (!stateRow.redirectUri) {
        return failRedirect("State OAuth tidak punya tujuan redirect.");
      }
      return c.redirect(buildRedirectUrl(stateRow.redirectUri, { code, state }));
    }

    // ── Jalur UI: perilaku lama, hanya isinya dipindah ke helper bersama ─────
    const cred = await getAppCredential(platform);

    // Exchange code → token
    const token = await exchangeCodeForToken(platform, cred, code);

    // Fetch profil user
    const profile = await fetchPlatformProfile(platform, token);

    const result = await buildPendingFromToken({
      platform,
      token,
      profile,
      organizationId: stateRow.organizationId,
      userId: stateRow.userId,
    });

    switch (result.kind) {
      case "pending":
        return c.redirect(
          `${env.WEB_URL}/accounts?pending=${encodeURIComponent(result.pendingId)}`,
        );
      case "connected":
        return c.redirect(`${env.WEB_URL}/accounts?connect_success=${platform}`);
      case "conflict":
        return failRedirect("Akun ini sudah terhubung di organisasi lain.");
      case "error":
        return failRedirect(result.message);
    }
  } catch (error) {
    console.error(`[oauth] callback ${platform} gagal:`, error);
    const msg = error instanceof Error ? error.message : "Gagal menghubungkan akun";
    return failRedirect(msg.slice(0, 300));
  }
}
