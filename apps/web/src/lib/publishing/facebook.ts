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

    // Media: upload pertama via /photos untuk mendapatkan media_fbid
    const firstUrl = payload.mediaUrls[0];
    console.log(`[facebook] uploading photo: ${firstUrl}`);
    params.set("url", firstUrl);
    params.set("published", "false"); // upload dulu, publish nanti

    const uploadRes = await fetch(`${GRAPH_URL}/${pageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) {
        console.error(`[facebook] /photos upload error:`, JSON.stringify(uploadData.error));
        return { success: false, error: uploadData.error.message, errorCode: uploadData.error.code?.toString() };
    }

    const firstMediaId = uploadData.id;

    // Multi-image: upload semua image, kumpulkan media_fbid
    const attachedMedia: string[] = [firstMediaId];
    for (let i = 1; i < payload.mediaUrls.length; i++) {
        const url = payload.mediaUrls[i];
        console.log(`[facebook] uploading photo ${i + 1}: ${url}`);
        const multiParams = new URLSearchParams({
            access_token: account.accessToken,
            url,
            published: "false",
        });
        const multiRes = await fetch(`${GRAPH_URL}/${pageId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: multiParams,
        });
        const multiData = await multiRes.json();
        if (multiData.error) {
            console.error(`[facebook] /photos upload ${i + 1} error:`, JSON.stringify(multiData.error));
            // Skip gambar yang gagal, lanjut dengan yang berhasil
            continue;
        }
        if (multiData.id) attachedMedia.push(multiData.id);
    }

    // Publish semua sekaligus
    const publishParams = new URLSearchParams({
        access_token: account.accessToken,
        message: payload.caption,
    });
    if (payload.location) publishParams.set("place", payload.location);

    // Facebook: attached_media[0][media_fbid]=xxx
    attachedMedia.forEach((mediaId, i) => {
        publishParams.set(`attached_media[${i}][media_fbid]`, mediaId);
    });

    console.log(`[facebook] publishing ${attachedMedia.length} photos to /feed`);
    const res = await fetch(`${GRAPH_URL}/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: publishParams,
    });
    const data = await res.json();
    if (data.error) {
        console.error(`[facebook] /feed publish error:`, JSON.stringify(data.error));
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