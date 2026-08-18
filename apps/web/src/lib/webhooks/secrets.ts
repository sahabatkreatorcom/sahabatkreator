import { db, schema } from "@sahabat-kreator/db";
import { env } from "@sahabat-kreator/env/server";
import { decryptToken } from "@/lib/token-encryption";
import { credentialPlatform, type Platform } from "@/lib/platforms/config";

/**
 * Secret webhook platform — single source, DIUTAMAKAN dari DB
 * `global_platform_credential` (dikelola super admin), fallback ke env.
 *
 * Ini menyatukan sumber secret connect OAuth dengan verifikasi webhook:
 *   - META (instagram/facebook/threads) : signature `X-Hub-Signature-256`
 *     memakai App Secret (= client_secret META); verify_token untuk handshake.
 *   - TIKTOK : signature `X-TikTok-Signature` memakai client_secret;
 *     challenge handshake memakai client_key (= client_id).
 *   - YOUTUBE : PubSubHubbub `hub.verify_token` (tanpa HMAC signature).
 *
 * Urutan nilai: DB dulu (admin bisa ubah tanpa deploy), env sebagai fallback.
 */
export interface WebhookSecretConfig {
    clientId: string | null;
    clientSecret: string | null;
    webhookVerifyToken: string | null;
}

export async function getWebhookSecretConfig(platform: Platform): Promise<WebhookSecretConfig> {
    const key = credentialPlatform(platform);

    const row = await db.query.globalPlatformCredential.findFirst({
        where: (t, { eq: _eq }) => _eq(t.platform, key),
        columns: {
            clientId: true,
            clientSecret: true,
            webhookVerifyToken: true,
            isConfigured: true,
        },
    });

    const dbClientSecret = row?.isConfigured && row.clientSecret ? decryptToken(row.clientSecret) : null;
    const dbVerifyToken = row?.isConfigured ? row.webhookVerifyToken ?? null : null;

    // Env fallback per platform.
    const envClientId = env[`${key}_CLIENT_ID` as keyof typeof env] as string | undefined;
    const envClientSecret = env[`${key}_CLIENT_SECRET` as keyof typeof env] as string | undefined;

    let signatureFallback: string | null = null;
    if (key === "META") {
        signatureFallback = env.META_APP_SECRET ?? null;
    } else if (key === "TIKTOK") {
        signatureFallback = envClientSecret ?? null;
    } else if (key === "YOUTUBE") {
        signatureFallback = envClientSecret ?? null;
    }

    return {
        clientId: row?.isConfigured ? row.clientId ?? null : (envClientId ?? null),
        clientSecret: dbClientSecret ?? signatureFallback,
        webhookVerifyToken: dbVerifyToken ?? env.WEBHOOK_VERIFY_TOKEN ?? null,
    };
}
