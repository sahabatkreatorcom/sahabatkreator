// Resolusi kredensial app per platform (DB platform_credential → fallback env) + refresh token.

import { db } from "@sahabatkreator/db";
import { platformCredential } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import type { AppCredential, OAuthPlatform } from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";

/** Mapping platform → env kredensial (playbook app-review-playbook.md) */
const ENV_CREDENTIAL_KEYS: Record<string, { id: keyof typeof env; secret: keyof typeof env }> = {
  // Instagram (akun bisnis via FB Login) & Facebook — satu aplikasi Meta
  instagram: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  facebook: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  // Instagram Login standalone — app IG sendiri di dev console Meta
  instagram_standalone: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
  threads: { id: "THREADS_APP_ID", secret: "THREADS_APP_SECRET" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
  youtube: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  google_business: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  pinterest: { id: "PINTEREST_APP_ID", secret: "PINTEREST_APP_SECRET" },
  linkedin: { id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET" },
  // App LinkedIn KEDUA (Community Management API) — kredensial & callback terpisah,
  // karena product itu wajib jadi satu-satunya product di app-nya.
  linkedin_org: { id: "LINKEDIN_ORG_CLIENT_ID", secret: "LINKEDIN_ORG_CLIENT_SECRET" },
};

/** Kredensial app per platform: platform_credential (DB, admin-managed) → fallback env */
export async function getAppCredential(platform: OAuthPlatform): Promise<AppCredential> {
  const [cred] = await db
    .select()
    .from(platformCredential)
    .where(and(eq(platformCredential.platform, platform), eq(platformCredential.isActive, true)))
    .limit(1);

  const envKeys = ENV_CREDENTIAL_KEYS[platform];
  const envClientId = envKeys ? (env[envKeys.id] as string | undefined) : undefined;
  const envClientSecret = envKeys ? (env[envKeys.secret] as string | undefined) : undefined;

  let clientId: string | undefined;
  let clientSecret: string | undefined;
  if (cred) {
    clientId = cred.clientId;
    const { decrypt } = await import("../../lib/crypto");
    try {
      clientSecret = decrypt(cred.clientSecretEnc);
    } catch {
      clientSecret = undefined;
    }
  }
  if (!clientId) clientId = envClientId;
  if (!clientSecret) clientSecret = envClientSecret;

  const serverUrl = env.SERVER_URL || "http://localhost:3000";
  const redirectUri = cred?.redirectUri || `${serverUrl}/api/oauth/${platform}/callback`;

  if (!clientId || !clientSecret) {
    const { HTTPError } = await import("../../lib/auth-guard");
    throw new HTTPError(
      400,
      `Kredensial OAuth ${platform} belum dikonfigurasi. Admin dapat mengaturnya di Admin Panel → Kredensial Platform, atau set ${envKeys ? `${String(envKeys.id)}/${String(envKeys.secret)}` : "env"} di .env`,
    );
  }

  // Extra scopes dari env (LinkedIn/TikTok: scope product terpisah, setelah approved)
  const extra: Record<string, string> = {};
  if (platform === "linkedin" && env.LINKEDIN_EXTRA_SCOPES) {
    extra.extraScopes = env.LINKEDIN_EXTRA_SCOPES;
  }
  if (platform === "tiktok" && env.TIKTOK_EXTRA_SCOPES) {
    extra.extraScopes = env.TIKTOK_EXTRA_SCOPES;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

/** Refresh token akun via adapter publishing (dipakai route refresh). */
export async function exchangeRefresh(
  platform: OAuthPlatform,
  cred: AppCredential,
  refreshToken: string,
) {
  const { refreshAccessToken } = await import("@sahabatkreator/publishing");
  return refreshAccessToken(platform, cred, refreshToken);
}
