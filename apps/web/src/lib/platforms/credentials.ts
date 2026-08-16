import { db, schema } from "@sahabat-kreator/db";
import { decryptToken } from "@/lib/token-encryption";
import { credentialPlatform, type Platform } from "./config";

/**
 * Ambil kredensial OAuth global (super admin) untuk platform tertentu.
 * Instagram & Facebook memakai kredensial META yang sama.
 * Kembalikan null bila belum dikonfigurasi.
 */
export async function getCredentialsForPlatform(
    platform: Platform,
): Promise<{ clientId: string; clientSecret: string } | null> {
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