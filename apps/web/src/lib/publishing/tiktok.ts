import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

const TIKTOK_API_URL = "https://open.tiktokapis.com/v2";

/**
 * TikTok Publisher — video & photo (PULL_FROM_URL).
 * Media kami di R2 selalu publik, jadi cukup pakai source PULL_FROM_URL
 * (TikTok menarik file dari URL) — tanpa upload chunk lokal.
 */
export async function publishToTikTok(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    // TikTok wajib privacy level eksplisit — tidak ada default.
    if (!payload.tiktokPrivacyLevel) {
        return {
            success: false,
            error: "Pilih tingkat privasi dulu sebelum menerbitkan ke TikTok.",
            errorCode: "MISSING_PRIVACY_LEVEL",
        };
    }

    const isPhoto =
        payload.postType === "carousel" || payload.mediaType === "image" || payload.mediaType === "text";

    if (isPhoto) {
        return publishPhoto(account, payload);
    }
    return publishVideo(account, payload);
}

async function publishVideo(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    if (payload.mediaType !== "video" || payload.mediaUrls.length === 0) {
        return { success: false, error: "TikTok butuh konten video atau gambar." };
    }

    const initBody = {
        post_info: {
            title: payload.caption,
            privacy_level: payload.tiktokPrivacyLevel,
            disable_duet: payload.tiktokDuets !== true,
            disable_comment: payload.tiktokComments !== true,
            disable_stitch: payload.tiktokStitches !== true,
            video_cover_timestamp_ms: 1000,
            brand_organic_toggle: payload.tiktokBrandOrganic ?? false,
            brand_content_toggle: payload.tiktokBrandContent ?? false,
            is_aigc: payload.tiktokIsAigc ?? false,
        },
        source_info: {
            source: "PULL_FROM_URL",
            video_url: payload.mediaUrls[0],
        },
    };

    const init = await fetch(`${TIKTOK_API_URL}/post/publish/video/init/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(initBody),
    });
    const initData = await init.json();
    if (initData.error && initData.error.code !== "ok") {
        return { success: false, error: initData.error.message || "Gagal init upload TikTok.", errorCode: initData.error.code };
    }

    const publishId = initData.data?.publish_id;
    if (!publishId) return { success: false, error: "Tidak ada publish_id dari TikTok." };

    const postId = await waitForPublishComplete(account.accessToken, publishId);
    if (!postId) {
        return {
            success: false,
            error: "TikTok menerima video dan masih memprosesnya.",
            errorCode: "PUBLISH_PENDING",
            postId: `tiktok_pending:${publishId}`,
        };
    }

    return {
        success: true,
        postId,
        postUrl: `https://tiktok.com/@${account.accountName}/video/${postId}`,
    };
}

async function publishPhoto(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    if (payload.mediaUrls.length === 0) {
        return { success: false, error: "Post foto TikTok butuh minimal satu gambar." };
    }
    if (payload.mediaUrls.length > 35) {
        return { success: false, error: "TikTok photo mode maksimal 35 gambar." };
    }

    const initBody = {
        post_info: {
            title: payload.caption,
            privacy_level: payload.tiktokPrivacyLevel,
            disable_comment: payload.tiktokComments !== true,
            brand_organic_toggle: payload.tiktokBrandOrganic ?? false,
            brand_content_toggle: payload.tiktokBrandContent ?? false,
            is_aigc: payload.tiktokIsAigc ?? false,
        },
        source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: payload.mediaUrls,
        },
        post_mode: "DIRECT_POST",
        media_type: "PHOTO",
    };

    const init = await fetch(`${TIKTOK_API_URL}/post/publish/content/init/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(initBody),
    });
    const initData = await init.json();
    if (initData.error && initData.error.code !== "ok") {
        return { success: false, error: initData.error.message || "Gagal init foto TikTok.", errorCode: initData.error.code };
    }

    const publishId = initData.data?.publish_id;
    if (!publishId) return { success: false, error: "Tidak ada publish_id dari TikTok." };

    const postId = await waitForPublishComplete(account.accessToken, publishId);
    if (!postId) {
        return {
            success: false,
            error: "TikTok menerima foto dan masih memprosesnya.",
            errorCode: "PUBLISH_PENDING",
            postId: `tiktok_pending:${publishId}`,
        };
    }

    return {
        success: true,
        postId,
        postUrl: `https://tiktok.com/@${account.accountName}/video/${postId}`,
    };
}

/** Poll status publish TikTok sampai selesai (maks ±45 dtk). */
async function waitForPublishComplete(
    accessToken: string,
    publishId: string,
): Promise<string | null> {
    for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));

        const res = await fetch(`${TIKTOK_API_URL}/post/publish/status/fetch/`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ publish_id: publishId }),
        });
        const data = await res.json();
        const status = data.data?.status;

        if (status === "PUBLISH_COMPLETE") {
            const publicId = data.data?.publiclyAvailablePostId?.[0];
            // Hanya ID numerik asli yang valid; publish_id (v_pub_file~...) tidak dipakai.
            if (publicId && /^\d+$/.test(String(publicId))) return String(publicId);
        }
        if (status === "FAILED") return null;
    }
    return null;
}