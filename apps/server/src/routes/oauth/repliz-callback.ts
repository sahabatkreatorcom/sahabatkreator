// GET /oauth/:platform/repliz-callback/:state — callback dari halaman Repliz.
//
// DUA jalur berbagi endpoint ini:
//   1. UI Sahabat Kreator  — stateRow.developerAppId NULL. SK yang menyelesaikan
//      connect (exchange/connect ke Repliz → pending picker atau akun) lalu
//      redirect ke WEB_URL/accounts.
//   2. API developer       — stateRow.developerAppId terisi. SK hanya jadi PROXY:
//      `code` Repliz diteruskan apa adanya ke redirectUri developer, dan TIDAK
//      menyentuh akun sama sekali. Developer yang memanggil
//      `POST /v1/accounts/:platform/connect`.
//
// MENGAPA jalur API butuh cabang DI SINI juga (koreksi atas §5.5 RFC): untuk
// platform bridge, `startOAuthFlow` mengarahkan authorize Repliz ke endpoint INI
// — bukan ke `redirectUri` developer — karena `redirect_uri` wajib terdaftar di
// app milik Repliz. Tanpa cabang ini developer tidak akan pernah menerima `code`
// untuk platform bridge (mayoritas platform saat ini), sehingga `POST /connect`
// mustahil dipanggil. Jadi bridge TIDAK "terbawa otomatis" seperti dugaan draf.

import { db } from "@sahabatkreator/db";
import { oauthState } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { isOAuthPlatformSupported, type OAuthPlatform } from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { buildRedirectUrl } from "../../lib/developer-app";
import { connectViaRepliz } from "../../lib/oauth-connect";

/**
 * GET  /oauth/:platform/repliz-callback/:state — callback dari halaman Repliz setelah
 * user approve OAuth di platform (via app milik Repliz). Browser tiba di path redirect
 * utuh dengan ?code=<repliz exchange code> ditambahkan Repliz (state kita di path
 * karena validasi redirect Repliz menolak query string).
 *
 * POST /oauth/:platform/repliz-callback/:state — varian untuk flow "fragment":
 * bila suatu saat Repliz mengembalikan token di URL FRAGMENT (#access_token=…)
 * yang TIDAK PERNAH dikirim ke server (docs Repliz: "read it in the browser with
 * window.location.hash and pass the value to your backend"), frontend page
 * /oauth/repliz-fragment/… mengekstrak fragment lalu POST code ke endpoint ini.
 * Response JSON { redirect } (bukan 302) agar frontend bisa navigasi.
 * Saat ini semua platform (termasuk FB) memakai GET langsung; POST = fallback.
 */
export async function handleReplizCallback(c: Context): Promise<Response> {
  const platform = c.req.param("platform") as OAuthPlatform;
  const isPost = c.req.method === "POST";
  // POST (fragment flow) → response JSON { redirect }; GET → 302 redirect biasa.
  const respond = (url: string): Response => (isPost ? c.json({ redirect: url }) : c.redirect(url));
  const failRedirect = (msg: string) =>
    respond(`${env.WEB_URL}/accounts?connect_error=${encodeURIComponent(msg)}`);

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

    // Platform/Repliz mengembalikan error (mis. user menolak consent). Untuk
    // jalur API error HARUS sampai ke developer, bukan ke halaman /accounts
    // kita — kalau tidak, UI developer menggantung menunggu callback yang tidak
    // pernah datang. Lookup di sini read-only (state tidak dikonsumsi) supaya
    // perilaku jalur UI tidak berubah.
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
    // JANGAN connect, JANGAN buat pending. `code` Repliz diteruskan ke developer;
    // dia yang memanggil `POST /v1/accounts/:platform/connect` (lihat
    // routes/oauth/connect.ts). State tetap DIHAPUS (baris di atas) meski code
    // diteruskan — org sudah bisa diresolusi dari API key, jadi state tidak
    // dibutuhkan lagi dan jaminan sekali-pakai tetap utuh.
    if (stateRow.developerAppId) {
      if (!stateRow.redirectUri) {
        return failRedirect("State OAuth tidak punya tujuan redirect.");
      }
      return c.redirect(buildRedirectUrl(stateRow.redirectUri, { code, state }));
    }

    // ── Jalur UI ─────────────────────────────────────────────────────────────
    // Seluruh keputusan "token/entitas → pending atau akun" ada di
    // `connectViaRepliz` (lib/oauth-connect.ts) supaya jalur API memakai logika
    // yang sama persis.
    const result = await connectViaRepliz({
      platform,
      code,
      organizationId: stateRow.organizationId,
      userId: stateRow.userId,
    });

    switch (result.kind) {
      case "pending":
        return respond(`${env.WEB_URL}/accounts?pending=${encodeURIComponent(result.pendingId)}`);
      case "connected":
        return respond(`${env.WEB_URL}/accounts?connect_success=${platform}`);
      case "conflict":
        return failRedirect("Akun ini sudah terhubung di organisasi lain.");
      case "error":
        return failRedirect(result.message);
    }
  } catch (error) {
    console.error(`[oauth] repliz-callback ${platform} gagal:`, error);
    const msg = error instanceof Error ? error.message : "Gagal menghubungkan akun via Repliz";
    return failRedirect(msg.slice(0, 300));
  }
}
