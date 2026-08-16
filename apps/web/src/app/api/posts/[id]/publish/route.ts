import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { publishToPlatform } from "@/lib/publishing";
import { decryptToken } from "@/lib/token-encryption";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/posts/[id]/publish — publish post sekarang (hanya yang belum terbit).
 */
export const POST = withAuth(async (ctx, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { id } = await params;

    const post = await db.query.post.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, activeOrganizationId)),
        with: {
            socialAccount: true,
            media: { with: { media: true }, orderBy: (pm, { asc }) => [asc(pm.order)] },
        },
    });

    if (!post) return json({ error: "Post tidak ditemukan." }, { status: 404 });
    if (!post.socialAccount) return json({ error: "Post tidak terhubung ke akun platform." }, { status: 400 });
    if (post.status === "PUBLISHED" || post.status === "PUBLISHING") {
        return json({ error: "Post sudah terbit/sedang terbit." }, { status: 400 });
    }
    if (post.status === "FAILED") {
        // izinkan retry
    }

    await db.update(schema.post)
        .set({ status: "PUBLISHING" })
        .where(and(eq(schema.post.id, id), eq(schema.post.organizationId, activeOrganizationId)));

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
        tiktokPrivacyLevel: post.tiktokPrivacyLevel ?? undefined,
        tiktokBrandOrganic: post.tiktokBrandOrganic,
        tiktokBrandContent: post.tiktokBrandContent,
        tiktokIsAigc: post.tiktokIsAigc,
        tiktokComments: post.tiktokComments,
        tiktokDuets: post.tiktokDuets,
        tiktokStitches: post.tiktokStitches,
        instagramShareToFeed: post.instagramShareToFeed,
        instagramComments: post.instagramComments,
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
        await db.insert(schema.publishError)
            .values({
                id: randomUUID(),
                postId: id,
                platform: post.socialAccount!.platform,
                errorCode: result.errorCode || "PUBLISH_FAILED",
                errorRaw: result.error || "Unknown error",
                errorHuman: result.error || "Publikasi gagal.",
                occurredAt: new Date(),
            });
        await db.update(schema.post)
            .set({ status: "FAILED" })
            .where(eq(schema.post.id, id));
        return json({ error: result.error }, { status: 502 });
    }

    await db.update(schema.post)
        .set({
            status: "PUBLISHED",
            publishedAt: new Date(),
            platformPostId: result.postId ?? null,
        })
        .where(eq(schema.post.id, id));

    return json({ success: true, postId: result.postId, postUrl: result.postUrl });
});

function determineMediaType(mimeTypes: string[]): "text" | "image" | "video" | "carousel" {
    if (mimeTypes.length === 0) return "text";
    if (mimeTypes.length > 1) return "carousel";
    if (mimeTypes[0].startsWith("video/")) return "video";
    return "image";
}