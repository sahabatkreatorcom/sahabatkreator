import type { PlatformAccount, PublishPayload, PublishResponse } from "./types";

const LINKEDIN_API = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202603";

/**
 * LinkedIn Publisher — Post & Article (versioned Posts API /rest/posts).
 */
export async function publishToLinkedIn(
    account: PlatformAccount,
    payload: PublishPayload,
): Promise<PublishResponse> {
    let authorUrn = account.accountId;
    if (!authorUrn.startsWith("urn:li:")) {
        authorUrn = `urn:li:person:${authorUrn}`;
    }

    try {
        if (payload.postType === "article") {
            if (!payload.link) {
                return { success: false, error: "Artikel LinkedIn butuh URL link." };
            }
            return publishPost(account.accessToken, authorUrn, {
                text: payload.caption,
                articleUrl: payload.link,
                articleTitle: payload.caption.slice(0, 200),
                mediaType: "article",
                visibility: (payload.linkedinVisibility as "PUBLIC" | "CONNECTIONS") || "PUBLIC",
            });
        }

        return publishPost(account.accessToken, authorUrn, {
            text: payload.caption,
            mediaUrls: payload.mediaUrls.length > 0 ? payload.mediaUrls : undefined,
            mediaType: payload.mediaType === "video" ? "video" : "image",
            visibility: (payload.linkedinVisibility as "PUBLIC" | "CONNECTIONS") || "PUBLIC",
            callToAction: payload.callToAction,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

interface LinkedPostInput {
    text: string;
    mediaUrls?: string[];
    mediaType?: "image" | "video" | "article";
    visibility?: "PUBLIC" | "CONNECTIONS";
    callToAction?: string;
    articleUrl?: string;
    articleTitle?: string;
}

async function publishPost(
    accessToken: string,
    authorUrn: string,
    input: LinkedPostInput,
): Promise<PublishResponse> {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    };

    const mediaIds: string[] = [];

    if (input.mediaUrls?.length && input.mediaType !== "article") {
        if (input.mediaType === "video") {
            for (const url of input.mediaUrls) {
                const size = await getFileSize(url);
                const init = await initVideo(accessToken, authorUrn, size);
                if (!init.success) return { success: false, error: init.error };
                const ok = await uploadBinary(accessToken, init.uploadUrl, url);
                if (!ok.success) return { success: false, error: ok.error };
                mediaIds.push(init.videoUrn);
            }
        } else {
            const results = await Promise.all(
                input.mediaUrls.map(async (url) => {
                    const init = await initImage(accessToken, authorUrn);
                    if (!init.success) return { success: false as const, error: init.error };
                    const ok = await uploadBinary(accessToken, init.uploadUrl, url);
                    if (!ok.success) return { success: false as const, error: ok.error };
                    return { success: true as const, urn: init.imageUrn };
                }),
            );
            for (const r of results) {
                if (!r.success) return { success: false, error: r.error };
                mediaIds.push(r.urn);
            }
        }
    }

    const postBody: Record<string, unknown> = {
        author: authorUrn,
        commentary: input.text,
        visibility: input.visibility || "PUBLIC",
        distribution: {
            feedDistribution: "MAIN_FEED",
            targetEntities: [],
            thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
    };

    if (input.callToAction) postBody.contentCallToActionLabel = input.callToAction;

    if (input.articleUrl) {
        postBody.content = { article: { source: input.articleUrl, title: input.articleTitle || "" } };
    } else if (mediaIds.length === 1) {
        postBody.content = { media: { id: mediaIds[0] } };
    } else if (mediaIds.length > 1) {
        postBody.content = { multiImage: { images: mediaIds.map((id) => ({ id })) } };
    }

    const res = await fetch(`${LINKEDIN_API}/rest/posts`, {
        method: "POST",
        headers,
        body: JSON.stringify(postBody),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.message || "Publish LinkedIn gagal." };
    }

    const postId = res.headers.get("x-restli-id") || "";
    // LinkedIn post ID berbentuk URN: urn:li:share:1234567890
    // Ekstrak numeric part untuk URL yang lebih clean
    const shareIdMatch = postId.match(/share:(\d+)/);
    const numericId = shareIdMatch ? shareIdMatch[1] : postId;
    return {
        success: true,
        postId: numericId || postId || undefined,
        postUrl: postId
            ? `https://www.linkedin.com/feed/update/${postId}`
            : undefined,
    };
}

async function getFileSize(url: string): Promise<number> {
    const res = await fetch(url, { method: "HEAD" });
    return parseInt(res.headers.get("content-length") || "0", 10);
}

async function initImage(
    accessToken: string,
    ownerUrn: string,
): Promise<{ success: true; uploadUrl: string; imageUrn: string } | { success: false; error: string }> {
    const res = await fetch(`${LINKEDIN_API}/rest/images?action=initializeUpload`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
    });
    const data = await res.json();
    if (!res.ok || !data.value?.uploadUrl || !data.value?.image) {
        return { success: false, error: data.message || "Gagal init upload gambar LinkedIn." };
    }
    return { success: true, uploadUrl: data.value.uploadUrl, imageUrn: data.value.image };
}

async function initVideo(
    accessToken: string,
    ownerUrn: string,
    fileSizeBytes: number,
): Promise<{ success: true; uploadUrl: string; videoUrn: string } | { success: false; error: string }> {
    const res = await fetch(`${LINKEDIN_API}/rest/videos?action=initializeUpload`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "LinkedIn-Version": LINKEDIN_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
            initializeUploadRequest: { owner: ownerUrn, fileSizeBytes, uploadCaptions: false, uploadThumbnail: false },
        }),
    });
    const data = await res.json();
    const uploadUrl = data.value?.uploadInstructions?.[0]?.uploadUrl;
    const videoUrn = data.value?.video;
    if (!res.ok || !uploadUrl || !videoUrn) {
        return { success: false, error: data.message || "Gagal init upload video LinkedIn." };
    }
    return { success: true, uploadUrl, videoUrn };
}

async function uploadBinary(
    accessToken: string,
    uploadUrl: string,
    mediaUrl: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const media = await fetch(mediaUrl);
        if (!media.ok) return { success: false, error: `Gagal mengambil media: ${media.status}` };
        const buffer = await media.arrayBuffer();
        const contentType = media.headers.get("content-type") || "application/octet-stream";

        const up = await fetch(uploadUrl, {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
            body: buffer,
        });
        if (!up.ok) return { success: false, error: `Upload media gagal: ${up.status}` };
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}