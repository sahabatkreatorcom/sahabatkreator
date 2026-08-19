import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { refreshAccessToken, getCredentialsForPlatform, type Platform } from "@/lib/platforms";
import { decryptToken, encryptToken } from "@/lib/token-encryption";

/**
 * Platform Meta memakai long-lived token (60 hari) yang HANYA bisa diperpanjang
 * SEBELUM kedaluwarsa, memakai access token itu sendiri (bukan refresh token).
 * Refresh dilakukan preemptif: 7 hari sebelum expiry.
 */
const META_LONG_LIVED: Platform[] = ["INSTAGRAM", "INSTAGRAM_PAGE", "FACEBOOK", "THREADS"];
const PREEMPTIVE_DAYS = 7;

export type TokenRefreshResult =
    | { refreshed: false; token: string; error?: undefined; needReconnect?: undefined }
    | { refreshed: true; token: string; error?: undefined; needReconnect?: undefined }
    | { refreshed: false; token: string; error: string; needReconnect: true };

export interface TokenAccountInput {
    id: string;
    platform: Platform;
    accessToken: string; // terenkripsi
    refreshToken?: string | null; // terenkripsi
    tokenExpiry?: Date | null;
}

/**
 * Pastikan token akun masih berlaku. Refresh otomatis bila perlu:
 * - Meta (IG/FB/Threads): 7 hari sebelum expiry, pakai access token.
 * - Platform lain: saat sudah expired, pakai refreshToken.
 * `force` dipakai tombol "Perbarui" manual — paksa refresh walau belum lewat expiry.
 * Kembalikan access token plaintext yang siap dipakai; simpan token baru ke DB.
 */
export async function refreshAccountTokenIfNeeded(
    account: TokenAccountInput,
    options: { force?: boolean } = {},
): Promise<TokenRefreshResult> {
    const accessToken = decryptToken(account.accessToken);

    const isMeta = META_LONG_LIVED.includes(account.platform);
    const expiry = account.tokenExpiry ? new Date(account.tokenExpiry).getTime() : null;

    // Meta: refresh preemptif < 7 hari. Lainnya: refresh bila sudah lewat.
    // `force` mengesampingkan keduanya (dipakai tombol "Perbarui" manual).
    const needsRefresh = options.force
        ? true
        : isMeta
          ? expiry !== null && expiry < Date.now() + PREEMPTIVE_DAYS * 86_400_000
          : expiry !== null && expiry < Date.now();

    if (!needsRefresh) return { refreshed: false, token: accessToken };

    // Meta memakai access token itu sendiri sebagai sumber refresh;
    // platform lain memakai refreshToken (long-lived).
    const source = isMeta ? accessToken : account.refreshToken ? decryptToken(account.refreshToken) : null;
    if (!source) {
        return {
            refreshed: false,
            token: accessToken,
            error: "Token akses kedaluwarsa dan tidak ada refresh token. Hubungkan ulang akun.",
            needReconnect: true,
        };
    }

    try {
        const credentials = (await getCredentialsForPlatform(account.platform)) || undefined;
        const refreshed = await refreshAccessToken(account.platform, source, credentials);

        await db.update(schema.socialAccount)
            .set({
                accessToken: encryptToken(refreshed.accessToken),
                refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
                tokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000),
                lastRefreshError: null,
            })
            .where(eq(schema.socialAccount.id, account.id));

        return { refreshed: true, token: refreshed.accessToken };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        await db.update(schema.socialAccount)
            .set({ lastRefreshError: message.slice(0, 500) })
            .where(eq(schema.socialAccount.id, account.id));
        return {
            refreshed: false,
            token: accessToken,
            error: `Gagal refresh token: ${message}. Hubungkan ulang akun.`,
            needReconnect: true,
        };
    }
}