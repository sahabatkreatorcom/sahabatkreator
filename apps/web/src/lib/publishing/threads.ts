import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

const THREADS_API = "https://graph.threads.net/v1.0";

/**
 * Threads Publisher — text, image, video, carousel.
 * Alur dua langkah: buat container → poll status → publish.
 */
export async function publishToThreads(
    account: PlatformAccount,
    inputPayload: PublishPayload,
): Promise<PublishResponse> {
    const userId = account.accountId;
    const accessToken = account.accessToken;
    const caption = inputPayload.caption || "";

    const opts: Record<string, string> = {};
    if (inputPayload.threadsTopicTag) opts.topic_tag = inputPayload.threadsTopicTag;
    if (inputPayload.threadsShareToIg) opts.crossreshare_to_ig = "true";

    try {
        // Carousel: buat child container per media
        if (inputPayload.mediaUrls.length > 1) {
            const childIds: string[] = [];
            for (const url of inputPayload.mediaUrls) {
                const type = isVideoUrl(url) ? "VIDEO" : "IMAGE";
                const child = await createContainer(userId, accessToken, {
                    media_type: type,
                    is_carousel_item: "true",
                    [type === "VIDEO" ? "video_url" : "image_url"]: url,
                });
                if (!child.ok) return { success: false, error: child.error, errorCode: child.errorCode };
                childIds.push(child.id!);
            }

            // Tunggu video children selesai diproses
            for (const childId of childIds) {
                const ready = await waitForContainer(childId, accessToken);
                if (!ready) return { success: false, error: `Item carousel ${childId} gagal diproses.` };
            }

            const parent = await createContainer(userId, accessToken, {
                media_type: "CAROUSEL",
                children: childIds.join(","),
                text: caption,
                ...opts,
            });
            if (!parent.ok) return { success: false, error: parent.error, errorCode: parent.errorCode };
            return publishContainer(userId, parent.id!, accessToken);
        }

        // Single media
        if (inputPayload.mediaUrls.length === 1) {
            const url = inputPayload.mediaUrls[0];
            const isVideo = isVideoUrl(url);
            const created = await createContainer(userId, accessToken, {
                media_type: isVideo ? "VIDEO" : "IMAGE",
                [isVideo ? "video_url" : "image_url"]: url,
                text: caption,
                ...opts,
            });
            if (!created.ok) return { success: false, error: created.error, errorCode: created.errorCode };

            const ready = await waitForContainer(created.id!, accessToken);
            if (!ready) {
                return {
                    success: false,
                    error: "Media Threads masih diproses. Coba lagi beberapa menit lagi.",
                    postId: `threads_pending:${created.id}`,
                };
            }
            return publishContainer(userId, created.id!, accessToken);
        }

        // Text-only
        if (!caption) return { success: false, error: "Post Threads butuh teks atau media." };

        // Auto-extract link untuk preview kartu
        const urlMatch = caption.match(/https?:\/\/[^\s]+/);
        const created = await createContainer(userId, accessToken, {
            media_type: "TEXT",
            text: caption,
            ...(urlMatch ? { link_attachment: urlMatch[0] } : {}),
            ...opts,
        });
        if (!created.ok) return { success: false, error: created.error, errorCode: created.errorCode };
        return publishContainer(userId, created.id!, accessToken);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

async function createContainer(
    userId: string,
    accessToken: string,
    params: Record<string, string>,
): Promise<{ ok: boolean; id?: string; error?: string; errorCode?: string }> {
    const res = await fetch(`${THREADS_API}/${userId}/threads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error?.message || "Gagal buat container Threads.", errorCode: err.error?.code?.toString() };
    }
    const data = await res.json();
    return { ok: true, id: data.id };
}

async function waitForContainer(containerId: string, accessToken: string): Promise<boolean> {
    for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`${THREADS_API}/${containerId}?fields=status`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.status === "FINISHED") return true;
        if (data.status === "ERROR" || data.status === "EXPIRED") return false;
    }
    return false;
}

async function publishContainer(
    userId: string,
    containerId: string,
    accessToken: string,
): Promise<PublishResponse> {
    const res = await fetch(`${THREADS_API}/${userId}/threads_publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: containerId }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || "Gagal publish Threads.", errorCode: err.error?.code?.toString() };
    }
    const data = await res.json();
    return { success: true, postId: data.id, postUrl: `https://threads.net/@${userId}/post/${data.id}` };
}

function isVideoUrl(url: string): boolean {
    const videoExtensions = [".mp4", ".mov", ".avi", ".webm", ".mkv"];
    const lower = url.toLowerCase().split("?")[0];
    return videoExtensions.some((ext) => lower.endsWith(ext));
}