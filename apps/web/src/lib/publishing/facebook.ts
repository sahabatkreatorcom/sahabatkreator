import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

/**
 * Facebook Publisher — post ke Page Feed (Graph API).
 */

const GRAPH_URL = "https://graph.facebook.com/v26.0";

export async function publishToFacebook(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    const pageId = account.accountId;

    const params = new URLSearchParams({
        access_token: account.accessToken,
        message: payload.caption,
    });

    if (payload.link) params.set("link", payload.link);
    // call_to_action bukan parameter standar Graph API /feed — dihapus agar tidak erro 100.
    if (payload.location) params.set("place", payload.location);

    // Text-only: gunakan /feed endpoint
    if (payload.mediaUrls.length === 0) {
        const res = await fetch(`${GRAPH_URL}/${pageId}/feed`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params,
        });
        const data = await res.json();
        if (data.error) {
            console.error(`[facebook] /feed error:`, JSON.stringify(data.error));
            return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
        }
        if (data.id && payload.firstComment?.trim()) {
            try {
                await fetch(`${GRAPH_URL}/${data.id}/comments`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        message: payload.firstComment.trim(),
                        access_token: account.accessToken,
                    }),
                });
            } catch {
                // non-fatal
            }
        }
        return { success: true, postId: data.id, postUrl: `https://www.facebook.com/${data.id}` };
    }

    // Media: post dengan media URL
    params.set("url", payload.mediaUrls[0]);
    if (payload.mediaUrls.length > 1) {
        payload.mediaUrls.slice(1).forEach((u, i) => params.set(`attached_media[${i}][media_fbid]`, u));
    }

    const res = await fetch(`${GRAPH_URL}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });
    const data = await res.json();
    if (data.error) {
        console.error(`[facebook] /photos error:`, JSON.stringify(data.error));
        return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
    }

    // Komentar pertama diposting SETELAH post terbit (tidak didukung saat pembuatan).
    if (data.id && payload.firstComment?.trim()) {
        try {
            await fetch(`${GRAPH_URL}/${data.id}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    message: payload.firstComment.trim(),
                    access_token: account.accessToken,
                }),
            });
        } catch {
            // non-fatal
        }
    }

    return { success: true, postId: data.id, postUrl: `https://www.facebook.com/${data.id}` };
}