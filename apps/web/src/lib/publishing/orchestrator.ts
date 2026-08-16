import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { publishToInstagram } from "./instagram";
import { publishToFacebook } from "./facebook";
import { refreshAccessToken, getCredentialsForPlatform } from "@/lib/platforms";
import { decryptToken, encryptToken } from "@/lib/token-encryption";
import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

/**
 * Publish content ke platform.
 * Menangani: token expired (refresh otomatis), rute ke publisher per platform.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    // Refresh token bila kedaluwarsa
    let token = account.accessToken;
    if (account.tokenExpiresAt && new Date() > account.tokenExpiresAt) {
        if (!account.refreshToken) {
            return { success: false, error: "Token akses kedaluwarsa dan tidak ada refresh token. Hubungkan ulang akun.", errorCode: "TOKEN_EXPIRED" };
        }
        try {
            const credentials = await getCredentialsForPlatform(account.platform) || undefined;
            const refreshed = await refreshAccessToken(account.platform, decryptToken(account.refreshToken), credentials);

            await db.update(schema.socialAccount)
                .set({
                    accessToken: encryptToken(refreshed.accessToken),
                    refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
                    tokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000),
                })
                .where(eq(schema.socialAccount.id, account.id));

            token = refreshed.accessToken;
        } catch (refreshError) {
            return {
                success: false,
                error: `Gagal refresh token: ${refreshError instanceof Error ? refreshError.message : "unknown"}. Hubungkan ulang akun.`,
                errorCode: "TOKEN_REFRESH_FAILED",
            };
        }
    }

    const acc = { ...account, accessToken: token };

    switch (account.platform) {
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE":
            return publishToInstagram(acc, payload);
        case "FACEBOOK":
            return publishToFacebook(acc, payload);
        case "MANUAL":
            return { success: true };
        default:
            return {
                success: false,
                error: `Publikasi otomatis ke ${account.platform} belum didukung. Buka platform untuk posting manual.`,
                errorCode: "UNSUPPORTED_PLATFORM",
            };
    }
}