import sharp from "sharp";
import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";
import { getPublicUrl, uploadFile } from "@/lib/storage";
import { randomUUID } from "node:crypto";

const TIKTOK_API_URL = "https://open.tiktokapis.com/v2";

/** TikTok error-reason code → pesan yang mudah dipahami pengguna berbahasa Indonesia. */
export function humanizeTikTokError(reason: string): string {
    const map: Record<string, string> = {
        url_ownership_unverified: "Domain gambar belum diverifikasi di TikTok Developer Portal. Verifikasi domain di bagian URL Properties.",
        photo_pull_failed: "TikTok gagal mengunduh gambar. Pastikan URL gambar bisa diakses publik tanpa redirect.",
        picture_size_check_failed: "Ukuran gambar terlalu kecil (minimum 360px).",
        file_format_check_failed: "Format gambar tidak didukung. Gunakan JPG, JPEG, atau PNG.",
        spam_risk_too_many_posts: "Batas post harian tercapai.",
        spam_risk_user_banned_from_posting: "Akun diblokir dari posting.",
        spam_risk_too_many_pending_share: "Terlalu banyak post pending (maks 5 per 24 jam).",
        unaudited_client_can_only_post_to_private_accounts: "App belum di-audit TikTok. Hanya bisa post ke akun private.",
        access_token_invalid: "Token akses tidak valid atau sudah expired.",
        scope_not_authorized: "App belum mendapat izin video.publish.",
    };
    return map[reason] || `TikTok error: ${reason}`;
}

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

    // TikTok HANYA terima JPEG/WEBP — convert PNG ke JPEG + validasi dimensi
    let photoImages: string[];
    try {
        photoImages = await ensureJpegUrls(payload.mediaUrls);
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Gagal memproses gambar.", errorCode: "INVALID_IMAGE" };
    }

    const initBody = {
        post_info: {
            title: payload.caption,
            privacy_level: payload.tiktokPrivacyLevel,
            disable_comment: payload.tiktokComments !== true,
            brand_organic_toggle: payload.tiktokBrandOrganic ?? false,
            brand_content_toggle: payload.tiktokBrandContent ?? false,
            is_aigc: payload.tiktokIsAigc ?? false,
            auto_add_music: payload.tiktokAutoAddMusic ?? true,
        },
        source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: photoImages,
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

/**
 * TikTok photo mode HANYA terima JPEG/WEBP — PNG ditolak.
 * Download semua gambar, validasi dimensi (min 360px), convert PNG ke JPEG via sharp.
 */
async function ensureJpegUrls(urls: string[]): Promise<string[]> {
    const results = await Promise.all(
        urls.map(async (url, i) => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Gagal download gambar #${i + 1}: HTTP ${res.status}`);

                const buf = Buffer.from(await res.arrayBuffer());
                const lower = url.toLowerCase();
                const isPng = lower.endsWith(".png") || lower.includes(".png?");

                if (isPng) {
                    // Convert PNG → JPEG, preserve dimensi
                    const jpegBuf = await sharp(buf)
                        .jpeg({ quality: 90 })
                        .toBuffer();
                    const meta = await sharp(jpegBuf).metadata();
                    const w = meta.width ?? 0;
                    const h = meta.height ?? 0;
                    if (w < 360 || h < 360) {
                        throw new Error(`Gambar #${i + 1} terlalu kecil (${w}x${h}px). TikTok minimum 360px.`);
                    }
                    const key = `tiktok-jpeg/${randomUUID()}.jpg`;
                    await uploadFile(key, jpegBuf, { contentType: "image/jpeg" });
                    return getPublicUrl(key);
                }

                // Bukan PNG — cek dimensi asli
                const meta = await sharp(buf).metadata();
                const w = meta.width ?? 0;
                const h = meta.height ?? 0;
                if (w < 360 || h < 360) {
                    throw new Error(`Gambar #${i + 1} terlalu kecil (${w}x${h}px). TikTok minimum 360px.`);
                }
                return url;
            } catch (e) {
                if (e instanceof Error && e.message.includes("terlalu kecil")) throw e;
                throw new Error(`Gagal memproses gambar #${i + 1}: ${e instanceof Error ? e.message : "unknown error"}`);
            }
        }),
    );
    return results;
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
            // publiclyAvailablePostId bisa berbagai format — ambil apapun yang ada
            const ids = data.data?.publiclyAvailablePostId;
            if (Array.isArray(ids) && ids.length > 0) {
                return String(ids[0]);
            }
            // ID kosong tapi status COMPLETE — tetap return success
            return "completed";
        }
        if (status === "FAILED") return null;
    }
    return null;
}