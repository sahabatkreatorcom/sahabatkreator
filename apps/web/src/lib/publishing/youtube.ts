import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

/**
 * YouTube Publisher — Video & Shorts.
 * Upload resumable: ambil video dari URL (R2) lalu kirim ke YouTube.
 */
export async function publishToYouTube(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    if (payload.mediaType !== "video" || payload.mediaUrls.length === 0) {
        return { success: false, error: "YouTube hanya mendukung konten video." };
    }

    const isShorts = payload.postType === "reel";
    const title = payload.videoTitle
        ? (isShorts ? `${payload.videoTitle.slice(0, 90)} #Shorts` : payload.videoTitle.slice(0, 100))
        : (isShorts ? `${payload.caption.slice(0, 90)} #Shorts` : payload.caption.slice(0, 100));

    try {
        // Ambil video dari R2
        const videoRes = await fetch(payload.mediaUrls[0]);
        if (!videoRes.ok) {
            return { success: false, error: `Gagal mengambil video dari R2: ${videoRes.status}` };
        }
        const videoBlob = await videoRes.blob();
        const contentType = videoRes.headers.get("content-type") || "video/mp4";
        const contentLength = videoBlob.size;

        // Metadata upload
        const metadata = {
            snippet: {
                title,
                description: payload.caption,
                tags: payload.videoTags || [],
                categoryId: payload.youtubeCategory || "22",
            },
            status: {
                privacyStatus: payload.youtubePrivacy || "private",
                embeddable: payload.embeddable ?? true,
                selfDeclaredMadeForKids: payload.madeForKids ?? false,
            },
        };

        const notifySubscribers = payload.notifySubscribers ?? true;
        const initUrl = `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=${notifySubscribers}`;

        const initRes = await fetch(initUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${account.accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": String(contentLength),
                "X-Upload-Content-Type": contentType,
            },
            body: JSON.stringify(metadata),
        });
        if (!initRes.ok) {
            const err = await initRes.json().catch(() => ({}));
            return {
                success: false,
                error: err.error?.message || "Gagal init upload YouTube.",
                errorCode: err.error?.code?.toString(),
            };
        }

        const uploadUrl = initRes.headers.get("location");
        if (!uploadUrl) return { success: false, error: "Tidak ada URL upload dari YouTube." };

        const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": contentType, "Content-Length": String(contentLength) },
            body: videoBlob,
        });
        if (!uploadRes.ok) {
            const err = await uploadRes.json().catch(() => ({}));
            return { success: false, error: err.error?.message || "Gagal upload video ke YouTube." };
        }

        const videoData = await uploadRes.json();
        const videoId = videoData.id;

        // Set custom thumbnail bila ada (opsional, non-fatal)
        if (payload.thumbnailUrl && videoId) {
            await setYouTubeThumbnail(account.accessToken, videoId, payload.thumbnailUrl);
        }

        return { success: true, postId: videoId, postUrl: `https://youtube.com/watch?v=${videoId}` };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

async function setYouTubeThumbnail(
    accessToken: string,
    videoId: string,
    thumbnailUrl: string,
): Promise<void> {
    try {
        const img = await fetch(thumbnailUrl);
        if (!img.ok) return;
        const blob = await img.blob();
        const contentType = img.headers.get("content-type") || "image/jpeg";
        if (!contentType.startsWith("image/")) return;
        if (blob.size > 2 * 1024 * 1024) return;

        await fetch(`https://www.googleapis.com/youtube/v3/thumbnails/set?videoId=${videoId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
            body: blob,
        });
    } catch {
        // non-fatal
    }
}