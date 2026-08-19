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
    if (payload.callToAction) params.set("call_to_action", payload.callToAction);
    if (payload.location) params.set("place", payload.location);

    // Media: post dengan media URL
    if (payload.mediaUrls.length > 0) {
        params.set("url", payload.mediaUrls[0]);
        if (payload.mediaUrls.length > 1) {
            // Attached media for multi-image posts
            payload.mediaUrls.slice(1).forEach((u, i) => params.set(`attached_media[${i}][media_fbid]`, u));
        }
    }

    const res = await fetch(`${GRAPH_URL}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });
    const data = await res.json();
    if (data.error) {
        return { success: false, error: data.error.message, errorCode: data.error.code?.toString() };
    }

    return { success: true, postId: data.id, postUrl: `https://facebook.com/${data.id}` };
}