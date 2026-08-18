import { db, schema } from "@sahabat-kreator/db";
import { env } from "@sahabat-kreator/env/server";
import { decryptToken } from "@/lib/token-encryption";
import { credentialPlatform, type Platform } from "./config";

/**
 * Ambil kredensial OAuth global untuk platform tertentu.
 *
 * Urutan (hybrid):
 *   1. ENV: `{PLATFORM}_CLIENT_ID` / `{PLATFORM}_CLIENT_SECRET` (dev / single-instance).
 *   2. DB `global_platform_credential` (dikelola super admin via admin panel).
 *
 * Instagram & Facebook memakai kredensial META yang sama.
 * Kembalikan null bila platform tidak punya kredensial di keduanya.
 */
export async function getCredentialsForPlatform(
    platform: Platform,
): Promise<{ clientId: string; clientSecret: string } | null> {
    // 1. Env — untuk platform yang diinisialisasi lewat environment.
    //    FACEBOOK & INSTAGRAM_PAGE memakai kredensial META (kunci yang sama dengan DB).
    const key = credentialPlatform(platform);
    const envClientId = env[`${key}_CLIENT_ID` as keyof typeof env] as string | undefined;
    const envClientSecret = env[`${key}_CLIENT_SECRET` as keyof typeof env] as string | undefined;
    if (envClientId && envClientSecret) {
        return { clientId: envClientId, clientSecret: envClientSecret };
    }

    // 2. DB — kredensial global super admin (per-platform).
    const enumPlatform = credentialPlatform(platform);

    const credential = await db.query.globalPlatformCredential.findFirst({
        where: (t, { eq: _eq }) => _eq(t.platform, enumPlatform),
        columns: { clientId: true, clientSecret: true, isConfigured: true },
    });

    if (!credential?.isConfigured || !credential.clientId) return null;

    return {
        clientId: credential.clientId,
        clientSecret: decryptToken(credential.clientSecret),
    };
}