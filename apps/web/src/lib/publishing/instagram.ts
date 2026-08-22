import { INSTAGRAM_GRAPH_URL, GRAPH_API_URL } from "@/lib/platforms";
import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

/**
 * Instagram Publisher — Feed, Story, Reel.
 * - INSTAGRAM_PAGE (tertaut FB Page): pakai Graph API Meta (graph.facebook.com/v26.0).
 * - INSTAGRAM (standalone): pakai Graph API sendiri (graph.instagram.com/v26.0).
 * Keduanya memakai alur container yang sama.
 */

function graphBase(account: PlatformAccount): string {
    return account.platform === "INSTAGRAM" ? INSTAGRAM_GRAPH_URL : GRAPH_API_URL;
}

export async function publishToInstagram(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    const igUserId = account.accountId;
    const base = graphBase(account);

    let result: PublishResponse;
    if (payload.postType === "story") {
        result = await publishStory(base, igUserId, account.accessToken, payload);
    } else if (payload.postType === "reel") {
        result = await publishReel(base, igUserId, account.accessToken, payload);
    } else {
        result = await publishFeed(base, igUserId, account.accessToken, payload);
    }

    // Komentar pertama hanya untuk media yang mendukung komentar (bukan story),
    // dan dilakukan SETELAH publish (API tidak mendukung saat buat container).
    if (result.success && result.postId && payload.firstComment?.trim()) {
        await addInstagramFirstComment(base, result.postId, account.accessToken, payload.firstComment.trim())
            .catch((err) => console.error(`[instagram] firstComment gagal post=${result.postId}: ${err instanceof Error ? err.message : err}`));
    }

    return result;
}

// ─── Feed ────────────────────────────────────────────────────────────────────

async function publishFeed(
    base: string,
    igUserId: string,
    token: string,
    payload: PublishPayload,
): Promise<PublishResponse> {
    if (payload.mediaUrls.length === 0) {
        return { success: false, error: "Post feed Instagram membutuhkan minimal satu media." };
    }

    // Carousel butuh ≥2 media
    if (payload.mediaUrls.length > 1) {
        return publishCarousel(base, igUserId, token, payload);
    }

    const url = payload.mediaUrls[0];
    const isVideo = payload.mediaType === "video" || /\.(mp4|mov|webm)(\?|#|$)/i.test(url);

    if (isVideo) {
        // Instagram feed video dipublish sebagai Reel
        return publishReel(base, igUserId, token, payload);
    }

    const containerRes = await fetch(`${base}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            image_url: url,
            caption: payload.caption,
            is_carousel_item: false,
            alt_text: payload.altText,
            location_id: payload.instagramLocationId,
            user_tags: payload.instagramUserTags?.length
                ? payload.instagramUserTags.map((t) => ({ username: t.username, x: t.x ?? 0.5, y: t.y ?? 0.5 }))
                : undefined,
            collaborators: payload.instagramCollaborators?.length ? payload.instagramCollaborators : undefined,
        }),
    });
    const container = await containerRes.json();
    if (container.error) {
        return { success: false, error: container.error.message, errorCode: container.error.code?.toString() };
    }

    return publishContainer(base, igUserId, token, container.id);
}

async function publishCarousel(
    base: string,
    igUserId: string,
    token: string,
    payload: PublishPayload,
): Promise<PublishResponse> {
    // Buat child container per media
    const childIds: string[] = [];
    for (const url of payload.mediaUrls) {
        const isVideo = /\.(mp4|mov|webm)(\?|#|$)/i.test(url);
        const res = await fetch(`${base}/${igUserId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                [isVideo ? "video_url" : "image_url"]: url,
                is_carousel_item: true,
            }),
        });
        const data = await res.json();
        if (data.error) {
            return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
        }
        childIds.push(data.id);
    }

    const carouselRes = await fetch(`${base}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            media_type: "CAROUSEL",
            children: childIds,
            caption: payload.caption,
            collaborators: payload.instagramCollaborators?.length ? payload.instagramCollaborators : undefined,
        }),
    });
    const carousel = await carouselRes.json();
    if (carousel.error) {
        return { success: false, error: carousel.error.message, errorCode: carousel.error.code?.toString() };
    }

    return publishContainer(base, igUserId, token, carousel.id);
}

// ─── Reel ────────────────────────────────────────────────────────────────────

async function publishReel(
    base: string,
    igUserId: string,
    token: string,
    payload: PublishPayload,
): Promise<PublishResponse> {
    if (!payload.mediaUrls[0]) {
        return { success: false, error: "Reel membutuhkan video." };
    }

    const body: Record<string, unknown> = {
        media_type: "REELS",
        video_url: payload.mediaUrls[0],
        caption: payload.caption,
        share_to_feed: payload.instagramShareToFeed ?? true,
        comments_disabled: payload.instagramComments === false,
        location_id: payload.instagramLocationId,
        collaborators: payload.instagramCollaborators?.length ? payload.instagramCollaborators : undefined,
    };
    if (payload.thumbnailUrl) body.cover_url = payload.thumbnailUrl;
    if (payload.isTrialReel) body.is_trial_reel = true;

    const res = await fetch(`${base}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    const container = await res.json();
    if (container.error) {
        return { success: false, error: container.error.message, errorCode: container.error.code?.toString() };
    }

    return publishContainer(base, igUserId, token, container.id);
}

// ─── Story ───────────────────────────────────────────────────────────────────

async function publishStory(
    base: string,
    igUserId: string,
    token: string,
    payload: PublishPayload,
): Promise<PublishResponse> {
    if (!payload.mediaUrls[0]) {
        return { success: false, error: "Story membutuhkan media." };
    }
    const url = payload.mediaUrls[0];
    const isVideo = payload.mediaType === "video" || /\.(mp4|mov|webm)(\?|#|$)/i.test(url);

    const res = await fetch(`${base}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            media_type: "STORIES",
            [isVideo ? "video_url" : "image_url"]: url,
            user_tags: payload.instagramUserTags?.length
                ? payload.instagramUserTags.map((t) => ({ username: t.username, x: t.x ?? 0.5, y: t.y ?? 0.5 }))
                : undefined,
        }),
    });
    const container = await res.json();
    if (container.error) {
        return { success: false, error: container.error.message, errorCode: container.error.code?.toString() };
    }

    return publishContainer(base, igUserId, token, container.id);
}

// ─── Shared ──────────────────────────────────────────────────────────────────

async function publishContainer(
    base: string,
    igUserId: string,
    token: string,
    containerId: string,
): Promise<PublishResponse> {
    // Container mungkin butuh waktu untuk diproses; poll status-nya.
    for (let i = 0; i < 20; i++) {
        const statusRes = await fetch(`${base}/${containerId}?fields=status_code,id`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const status = await statusRes.json();

        if (status.status_code === "FINISHED") break;
        if (status.status_code === "ERROR" || status.error) {
            return {
                success: false,
                error: status.error?.message || "Container Instagram gagal diproses.",
                errorCode: "IG_CONTAINER_ERROR",
            };
        }
        await new Promise((r) => setTimeout(r, 2000));
    }

    const publishRes = await fetch(`${base}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creation_id: containerId }),
    });
    const result = await publishRes.json();
    if (result.error) {
        return { success: false, error: result.error.message, errorCode: result.error.code?.toString() };
    }

    return { success: true, postId: result.id, postUrl: `https://instagram.com/p/${result.id}` };
}

/**
 * Posting komentar pertama dilakukan SETELAH media dipublish —
 * API Instagram tidak mendukung first comment saat pembuatan container.
 * Non-fatal: kegagalan komentar tidak menggagalkan publish post.
 */
export async function addInstagramFirstComment(
    base: string,
    mediaId: string,
    token: string,
    message: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${base}/${mediaId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (data.error) return { success: false, error: data.error.message };
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Gagal menambahkan komentar pertama" };
    }
}