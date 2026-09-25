// Proxy TikTok creator_info — memanggil Content Posting API dari server agar
// access token tidak pernah menyentuh browser. Wajib saat merender panel
// pengaturan TikTok di Compose (Content Sharing Guidelines #1).
//
// GET /tiktok/creator-info?accountId=
// → { creatorUsername, creatorNickname, creatorAvatarUrl, privacyLevelOptions,
//     commentDisabled, duetDisabled, stitchDisabled, maxVideoPostDurationSec }
// Error (akun diblokir / rate limit / token expired) → { message, code } + status.

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import {
  fetchTikTokCreatorInfo,
  PublishError,
  type TikTokCreatorInfo,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, HTTPError, requireOrg } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";

export const tiktokRoute = new Hono();

/** Ambil akun TikTok milik org + token plaintext (atau lempar 400/404) */
async function getTikTokAccount(accountId: string, organizationId: string) {
  const [account] = await db
    .select({
      id: socialAccount.id,
      platform: socialAccount.platform,
      username: socialAccount.username,
      accessTokenEnc: socialAccount.accessTokenEnc,
      isConnected: socialAccount.isConnected,
    })
    .from(socialAccount)
    .where(and(eq(socialAccount.id, accountId), eq(socialAccount.organizationId, organizationId)))
    .limit(1);

  if (!account) throw new HTTPError(404, "Akun tidak ditemukan");
  if (account.platform !== "tiktok") throw new HTTPError(400, "Akun bukan TikTok");
  if (!account.isConnected || !account.accessTokenEnc) {
    throw new HTTPError(400, "Akun TikTok belum terhubung — hubungkan ulang");
  }

  try {
    return { ...account, accessToken: decrypt(account.accessTokenEnc) };
  } catch {
    throw new HTTPError(400, "Token TikTok tidak bisa dibaca — hubungkan ulang");
  }
}

/**
 * GET /tiktok/creator-info?accountId=
 * Di-cache di client (react-query) — rate limit upstream 20 req/menit per token.
 */
tiktokRoute.get("/creator-info", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accountId = c.req.query("accountId");
    if (!accountId) throw new HTTPError(400, "accountId wajib diisi");

    const account = await getTikTokAccount(accountId, ctx.organization.id);
    let info: TikTokCreatorInfo;
    try {
      info = await fetchTikTokCreatorInfo(account.accessToken);
    } catch (error) {
      if (error instanceof PublishError) {
        // Akun diblokir (kuota harian / spam risk) → 409 + kode agar UI bisa
        // menghentikan publish & meminta user mencoba lagi nanti.
        const blocked = error.code.startsWith("tiktok_") && error.code !== "tiktok_rate_limit_exceeded";
        return c.json(
          { message: error.message, code: error.code },
          blocked ? 409 : error.code.startsWith("http_") ? 502 : 400,
        );
      }
      throw error;
    }
    return c.json(info);
  } catch (error) {
    return errorResponse(error);
  }
});
