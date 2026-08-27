import { initializeAdapters } from "./adapters";
import { adapterRegistry } from "./adapters/adapter-registry";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

/**
 * Publish content ke platform.
 * Menangani: token expired (refresh otomatis), rute ke adapter per platform,
 * fallback otomatis jika adapter utama gagal.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    initializeAdapters();

    // MANUAL = no-op
    if (account.platform === "MANUAL") {
        return { success: true };
    }

    // Token refresh hanya untuk native adapter
    // (Repliz handle token sendiri via Basic Auth)
    let token = account.accessToken;
    const primaryAdapter = adapterRegistry.getAdapter(account.platform);
    const isNative = primaryAdapter?.name === "native";

    if (isNative) {
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
    }

    const acc = { ...account, accessToken: token };

    // Try adapters dengan fallback
    const allAdapters = adapterRegistry.getAllAdapters(account.platform);

    for (const entry of allAdapters) {
        if (!entry.adapter.isConfigured() || !entry.adapter.supportsPlatform(account.platform)) {
            continue;
        }

        try {
            const result = await entry.adapter.publish(acc, payload);

            // Success atau PUBLISH_PENDING = return langsung
            if (result.success || result.errorCode === "PUBLISH_PENDING") {
                return result;
            }

            // Adapter gagal, coba next
            console.warn(
                `[orchestrator] ${entry.adapter.name} failed for ${account.platform}: ${result.error}`,
            );
        } catch (error) {
            console.error(`[orchestrator] ${entry.adapter.name} error:`, error);
        }
    }

    return {
        success: false,
        error: `Publikasi otomatis ke ${account.platform} gagal. Semua adapter tidak tersedia.`,
        errorCode: "ALL_ADAPTERS_FAILED",
    };
}
