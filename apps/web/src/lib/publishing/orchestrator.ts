import { publishToInstagram } from "./instagram";
import { publishToFacebook } from "./facebook";
import { publishToTikTok } from "./tiktok";
import { publishToYouTube } from "./youtube";
import { publishToPinterest } from "./pinterest";
import { publishToLinkedIn } from "./linkedin";
import { publishToThreads } from "./threads";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

/**
 * Publish content ke platform.
 * Menangani: token expired (refresh otomatis), rute ke publisher per platform.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    // Refresh token bila perlu (Meta: preemptif 7 hari; lain: saat expired)
    let token = account.accessToken;
    const refreshed = await refreshAccountTokenIfNeeded({
        id: account.id,
        platform: account.platform,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        tokenExpiry: account.tokenExpiresAt,
    });
    if (refreshed.needReconnect) {
        return { success: false, error: refreshed.error, errorCode: "TOKEN_EXPIRED" };
    }
    token = refreshed.token;

    const acc = { ...account, accessToken: token };

    switch (account.platform) {
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE":
            return publishToInstagram(acc, payload);
        case "FACEBOOK":
            return publishToFacebook(acc, payload);
        case "TIKTOK":
            return publishToTikTok(acc, payload);
        case "YOUTUBE":
            return publishToYouTube(acc, payload);
        case "PINTEREST":
            return publishToPinterest(acc, payload);
        case "LINKEDIN":
            return publishToLinkedIn(acc, payload);
        case "THREADS":
            return publishToThreads(acc, payload);
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