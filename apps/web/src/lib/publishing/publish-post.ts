import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { publishToPlatform } from "./orchestrator";
import type { PublishPayload } from "./types";
import { decryptToken } from "@/lib/token-encryption";
import { logActivity } from "@/lib/activity-log";

export interface PublishPostResult {
    ok: boolean;
    error?: string;
    errorCode?: string;
    postId?: string;
    postUrl?: string;
}

/**
 * Terbitkan satu post (manual atau dari worker terjadwal).
 * Alur: validasi → status PUBLISHING → publish ke platform → PUBLISHED/FAILED.
 * Post yang sudah PUBLISHED/PUBLISHING ditolak (anti double-publish).
 */
export async function publishPost(
    organizationId: string,
    postId: string,
): Promise<PublishPostResult> {
    const post = await db.query.post.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, postId), _eq(t.organizationId, organizationId)),
        with: {
            socialAccount: true,
            media: { with: { media: true }, orderBy: (pm, { asc }) => [asc(pm.order)] },
        },
    });

    if (!post) return { ok: false, error: "Post tidak ditemukan." };
    if (!post.socialAccount) return { ok: false, error: "Post tidak terhubung ke akun platform." };
    if (post.status === "PUBLISHED") {
        return { ok: false, error: "Post sudah terbit." };
    }
    if (post.status === "PUBLISHING") {
        return { ok: false, error: "Post sedang diproses oleh platform." };
    }

    await db.update(schema.post)
        .set({ status: "PUBLISHING" })
        .where(and(eq(schema.post.id, postId), eq(schema.post.organizationId, organizationId)));

    const payload = {
        caption: post.caption || "",
        mediaUrls: post.media.map((pm) => pm.media.url),
        mediaType: determineMediaType(post.media.map((pm) => pm.media.mimeType)),
        postType: post.postType.toLowerCase() as never,
        callToAction: post.callToAction ?? undefined,
        firstComment: post.firstComment ?? undefined,
        location: post.location ?? undefined,
        link: post.pinLink ?? undefined,
        boardId: post.boardId ?? undefined,
        pinTitle: post.pinTitle ?? undefined,
        videoTitle: post.videoTitle ?? undefined,
        youtubeCategory: post.youtubeCategory ?? undefined,
        videoTags: post.videoTags ?? [],
        youtubePrivacy: post.youtubePrivacy ?? undefined,
        madeForKids: post.madeForKids,
        notifySubscribers: post.notifySubscribers,
        embeddable: post.embeddable,
        youtubeCommentsEnabled: post.youtubeCommentsEnabled,
        linkedinVisibility: post.linkedinVisibility ?? undefined,
        threadsTopicTag: post.threadsTopicTag ?? undefined,
        threadsShareToIg: post.threadsShareToIg,
        tiktokPrivacyLevel: post.tiktokPrivacyLevel ?? undefined,
        tiktokBrandOrganic: post.tiktokBrandOrganic,
        tiktokBrandContent: post.tiktokBrandContent,
        tiktokIsAigc: post.tiktokIsAigc,
        tiktokComments: post.tiktokComments,
        tiktokDuets: post.tiktokDuets,
        tiktokStitches: post.tiktokStitches,
        tiktokAutoAddMusic: post.tiktokAutoAddMusic,
        instagramShareToFeed: post.instagramShareToFeed,
        instagramComments: post.instagramComments,
        instagramLocationId: post.instagramLocationId ?? undefined,
        instagramUserTags: post.instagramUserTags as unknown as PublishPayload["instagramUserTags"] | undefined,
        instagramCollaborators: post.instagramCollaborators as unknown as PublishPayload["instagramCollaborators"] | undefined,
        isTrialReel: post.isTrialReel,
        altText: post.altText ?? undefined,
    };

    const result = await publishToPlatform(
        {
            id: post.socialAccount.id,
            platform: post.socialAccount.platform,
            accountId: post.socialAccount.platformId,
            accountName: post.socialAccount.name,
            accessToken: decryptToken(post.socialAccount.accessToken),
            refreshToken: post.socialAccount.refreshToken,
            tokenExpiresAt: post.socialAccount.tokenExpiry,
        },
        payload,
    );

    if (!result.success) {
        // PUBLISH_PENDING: TikTok masih memproses — jangan mark FAILED, simpan sebagai PUBLISHING
        if (result.errorCode === "PUBLISH_PENDING" && result.postId) {
            await db.update(schema.post)
                .set({ status: "PUBLISHING", platformPostId: result.postId, externalUrl: result.postUrl ?? null })
                .where(eq(schema.post.id, postId));
            return { ok: false, error: result.error, errorCode: result.errorCode };
        }

        await db.insert(schema.publishError)
            .values({
                id: randomUUID(),
                postId,
                platform: post.socialAccount.platform,
                errorCode: result.errorCode || "PUBLISH_FAILED",
                errorRaw: result.error || "Unknown error",
                errorHuman: result.error || "Publikasi gagal.",
                occurredAt: new Date(),
            });
        await db.update(schema.post)
            .set({ status: "FAILED" })
            .where(eq(schema.post.id, postId));
        await logActivity(
            organizationId,
            "post.failed",
            { type: "post", id: postId, name: post.caption.slice(0, 100) },
            { platform: post.socialAccount.platform, error: result.error },
        );
        return { ok: false, error: result.error, errorCode: result.errorCode };
    }

    await db.update(schema.post)
        .set({
            status: "PUBLISHED",
            publishedAt: new Date(),
            platformPostId: result.postId !== "completed" ? result.postId ?? null : post.platformPostId,
            externalUrl: result.postUrl ?? null,
        })
        .where(eq(schema.post.id, postId));

    await logActivity(
        organizationId,
        "post.published",
        { type: "post", id: postId, name: post.caption.slice(0, 100) },
        { platform: post.socialAccount.platform },
    );
    return { ok: true, postId: result.postId, postUrl: result.postUrl };
}

function determineMediaType(mimeTypes: string[]): "text" | "image" | "video" | "carousel" {
    if (mimeTypes.length === 0) return "text";
    if (mimeTypes.length > 1) return "carousel";
    if (mimeTypes[0].startsWith("video/")) return "video";
    return "image";
}