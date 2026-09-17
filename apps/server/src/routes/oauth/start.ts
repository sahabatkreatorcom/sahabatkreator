// GET /oauth/:platform/start — mulai OAuth flow.

import { db } from "@sahabatkreator/db";
import { oauthState } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  buildAuthorizeUrl,
  isOAuthPlatformSupported,
  type OAuthPlatform,
  replizAuthorizeUrl,
} from "@sahabatkreator/publishing";
import { lt } from "drizzle-orm";
import type { Context } from "hono";
import { errorResponse, requireOrg } from "../../lib/auth-guard";
import { checkFeatureGate } from "../../lib/billing";
import { getReplizCredentials, isReplizRouted, toReplizPlatformKey } from "../../lib/bridge";
import { generateId } from "../../lib/id";
import { getAppCredential } from "./credentials";

/**
 * GET /oauth/:platform/start — mulai OAuth flow.
 * Return JSON { authorizeUrl } — frontend redirect ke URL tsb.
 * (Tidak langsung 302 agar state tercatat dulu di DB.)
 */
export async function handleStart(c: Context): Promise<Response> {
  try {
    const ctx = await requireOrg(c);
    const platform = c.req.param("platform") as OAuthPlatform;
    if (!isOAuthPlatformSupported(platform)) {
      return c.json({ message: `OAuth platform ${platform} tidak didukung.` }, 400);
    }
    await checkFeatureGate(ctx.organization.id, "social_accounts");

    // Bridge Repliz: connect-flow baru diarahkan ke OAuth app Repliz (bukan app native)
    if (await isReplizRouted(platform)) {
      const cred = await getReplizCredentials();
      const platformKey = toReplizPlatformKey(platform);
      if (!cred || !platformKey) {
        return c.json(
          { message: "Bridge Repliz aktif tapi kredensial belum dikonfigurasi admin." },
          400,
        );
      }
      const state = generateId("oauthstate") + generateId("nonce");
      await db.insert(oauthState).values({
        id: generateId("ost"),
        state,
        platform,
        organizationId: ctx.organization.id,
        userId: ctx.user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      await db.delete(oauthState).where(lt(oauthState.expiresAt, new Date()));
      // State HARUS di path (bukan query) — validasi redirect Repliz menolak URL
      // dengan query string, tapi menerima path tambahan. Terbukti via spike:
      // browser tiba di /repliz-callback/{state}?code=... (path utuh + code ditambahkan).
      const serverUrl = env.SERVER_URL || "http://localhost:3000";
      const redirect = `${serverUrl}/api/oauth/${platform}/repliz-callback/${state}`;
      const authorizeUrl = await replizAuthorizeUrl(cred, platformKey, redirect);
      return c.json({ authorizeUrl });
    }

    const cred = await getAppCredential(platform);

    // State random + persist (TTL 10 menit, sekali pakai)
    const state = generateId("oauthstate") + generateId("nonce");
    await db.insert(oauthState).values({
      id: generateId("ost"),
      state,
      platform,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // Bersihkan state expired (housekeeping ringan tiap start)
    await db.delete(oauthState).where(lt(oauthState.expiresAt, new Date()));

    const authorizeUrl = buildAuthorizeUrl(platform, cred, state);
    return c.json({ authorizeUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
