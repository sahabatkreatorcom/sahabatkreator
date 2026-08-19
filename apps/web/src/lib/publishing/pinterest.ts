import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";
import { PINTEREST_API_BASE, PINTEREST_IS_SANDBOX } from "@/lib/platforms/pinterest-config";

/**
 * Pinterest Publisher — Pin & Carousel.
 * Media kami di R2 publik → pakai source image_url (Pinterest menarik dari URL).
 * Video wajib di-upload via /media dulu (Pinterest tidak menerima URL video mentah).
 *
 * Sandbox (Trial access): semua Pin/Board = Sandbox entity (visible only to
 * creator). Catatan: video Pin TIDAK didukung di Sandbox — ditolak lebih awal.
 */
export async function publishToPinterest(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    const boardId = payload.boardId;
    if (!boardId) {
        return { success: false, error: "Pinterest wajib memilih board dulu.", errorCode: "MISSING_BOARD" };
    }

    if (payload.postType === "carousel" && payload.mediaUrls.length > 1) {
        return publishCarousel(account, payload, boardId);
    }
    if (payload.mediaUrls.length === 0) {
        return { success: false, error: "Pinterest membutuhkan gambar atau video." };
    }
    if (payload.mediaType === "video" && PINTEREST_IS_SANDBOX) {
        return { success: false, error: "Video Pin tidak didukung di Sandbox Pinterest (Trial access).", errorCode: "SANDBOX_NO_VIDEO" };
    }

    try {
        let mediaSource: Record<string, unknown>;

        if (payload.mediaType === "video") {
            // Video: download dari R2 lalu upload via /media
            const videoRes = await fetch(payload.mediaUrls[0]);
            if (!videoRes.ok) return { success: false, error: `Gagal mengambil video: ${videoRes.status}` };
            const buffer = Buffer.from(await videoRes.arrayBuffer());
            const upload = await uploadVideo(account.accessToken, buffer);
            if (!upload.success) return { success: false, error: upload.error };
            mediaSource = { source_type: "video_id", media_id: upload.mediaId };
        } else {
            mediaSource = { source_type: "image_url", url: payload.mediaUrls[0] };
        }

        const pinBody: Record<string, unknown> = {
            title: payload.pinTitle || payload.caption.slice(0, 100),
            description: payload.caption,
            alt_text: payload.altText || payload.caption.slice(0, 500),
            link: payload.link || undefined,
            board_id: boardId,
            media_source: mediaSource,
        };
        if (payload.mediaType === "video" && payload.thumbnailUrl) {
            pinBody.cover_image_url = payload.thumbnailUrl;
        }

        const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
            method: "POST",
            headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(pinBody),
        });
        const data = await res.json();
        if (!res.ok) {
            return { success: false, error: data.message || "Publish Pinterest gagal." };
        }

        return { success: true, postId: data.id, postUrl: `https://pinterest.com/pin/${data.id}` };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

async function publishCarousel(
    account: PlatformAccount,
    payload: PublishPayload,
    boardId: string,
): Promise<PublishResponse> {
    if (payload.mediaUrls.length < 2 || payload.mediaUrls.length > 5) {
        return { success: false, error: "Carousel Pinterest butuh 2–5 gambar." };
    }

    try {
        const items = payload.mediaUrls.map((url) => ({
            title: payload.pinTitle || payload.caption.slice(0, 100),
            description: payload.caption,
            link: payload.link || undefined,
            media_source: { source_type: "image_url", url },
        }));

        const res = await fetch(`${PINTEREST_API_BASE}/pins`, {
            method: "POST",
            headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ board_id: boardId, carousel_slots: items }),
        });
        const data = await res.json();
        if (!res.ok) {
            return { success: false, error: data.message || "Publish carousel Pinterest gagal." };
        }

        return { success: true, postId: data.id, postUrl: `https://pinterest.com/pin/${data.id}` };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

/** Upload video ke /media lalu poll status sampai selesai. */
async function uploadVideo(
    accessToken: string,
    buffer: Buffer,
): Promise<{ success: true; mediaId: string } | { success: false; error: string }> {
    try {
        const register = await fetch(`${PINTEREST_API_BASE}/media`, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ media_type: "video" }),
        });
        const reg = await register.json();
        if (!register.ok || !reg.upload_url) {
            return { success: false, error: reg.message || "Gagal register upload video." };
        }

        const form = new FormData();
        if (reg.upload_parameters) {
            for (const [k, v] of Object.entries(reg.upload_parameters)) {
                form.append(k, v as string);
            }
        }
        form.append("file", new Blob([new Uint8Array(buffer)], { type: "video/mp4" }), "video.mp4");

        const upload = await fetch(reg.upload_url, { method: "POST", body: form });
        if (!upload.ok && upload.status !== 204) {
            return { success: false, error: `Upload video gagal: ${upload.status}` };
        }

        for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise((r) => setTimeout(r, attempt < 3 ? 2000 : 5000));
            const statusRes = await fetch(`${PINTEREST_API_BASE}/media/${reg.media_id}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const status = await statusRes.json();
            if (status.status === "succeeded") return { success: true, mediaId: reg.media_id };
            if (status.status === "failed") return { success: false, error: "Proses video Pinterest gagal." };
        }
        return { success: false, error: "Proses video Pinterest timeout." };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}