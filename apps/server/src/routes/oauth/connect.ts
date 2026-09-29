// Orkestrasi "code → hasil connect" untuk jalur API (docs/rfc-oauth-connect.md fase 3).
//
// MENGAPA file ini ada: `POST /v1/accounts/:platform/connect` dan
// `POST /v1/accounts/:platform/exchange` butuh langkah yang PERSIS sama dengan
// jalur UI (exchange code → profil → pending atau connect langsung), tapi tanpa
// redirect. Menyalinnya ke handler API berarti dua salinan yang harus dijaga
// sinkron setiap kali routing platform berubah.

import {
  exchangeCodeForToken,
  fetchPlatformProfile,
  isOAuthPlatformSupported,
  type OAuthPlatform,
} from "@sahabatkreator/publishing";
import { isReplizRouted } from "../../lib/bridge";
import {
  type BuildPendingResult,
  buildPendingFromToken,
  connectViaRepliz,
} from "../../lib/oauth-connect";
import { getAppCredential } from "./credentials";

/**
 * Tukar `code` (yang diterima developer di `redirectUri`) menjadi akun
 * terhubung, atau pending picker bila platform butuh pemilihan aset.
 *
 * Routing native vs bridge diputuskan DI SINI — pemanggil tidak perlu tahu, dan
 * itu memang tujuannya: daftar platform bridge berubah setiap kali approval
 * platform turun, jadi tidak boleh bocor ke kontrak publik (RFC §4.3).
 *
 * `code` bersifat sekali pakai di sisi platform: pemanggilan kedua dengan code
 * yang sama akan gagal dari platform, bukan dari kita.
 */
export async function connectWithCode(params: {
  platform: OAuthPlatform;
  code: string;
  organizationId: string;
  userId: string;
}): Promise<BuildPendingResult> {
  const { platform, code, organizationId, userId } = params;

  if (!isOAuthPlatformSupported(platform)) {
    return { kind: "error", message: `Platform ${platform} tidak mendukung connect lewat OAuth.` };
  }

  // Bridge Repliz: `code`-nya code milik Repliz (bukan platform), dan
  // entitasnya datang dari API Repliz — lihat lib/oauth-connect.ts.
  if (await isReplizRouted(platform)) {
    return connectViaRepliz({ platform, code, organizationId, userId });
  }

  const cred = await getAppCredential(platform);
  const token = await exchangeCodeForToken(platform, cred, code);
  const profile = await fetchPlatformProfile(platform, token);
  return buildPendingFromToken({ platform, token, profile, organizationId, userId });
}
