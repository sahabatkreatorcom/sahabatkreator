import { randomUUID } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";
import { and, eq } from "drizzle-orm";

export interface CreatePostParams {
    organizationId: string;
    caption?: string;
    platformAccountIds: string[];
    mediaIds?: string[];
    scheduledAt?: string | null;
    autoPublish?: boolean;
    firstComment?: string;
    platformSettings?: Record<string, PlatformSettingsInput>;
}

export interface PlatformSettingsInput {
    postType?: string;
    caption?: string;
    mediaIds?: string[];
    firstComment?: string;
    autoPublish?: boolean;
    callToAction?: string;
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;
    location?: string;
    videoTitle?: string;
    youtubeCategory?: string;
    youtubePlaylist?: string;
    videoTags?: string[];
    altText?: string;
    threadsTopicTag?: string;
    linkedinVisibility?: string;
    tiktokPrivacyLevel?: string;
    instagramShareToFeed?: boolean;
}

export interface CreatedPostInfo {
    id: string;
    caption: string;
    status: string;
    scheduledAt: string | null;
    createdAt: string;
    platform?: string;
    linkedGroupId: string | null;
}

export interface CreatePostResult {
    status: number;
    error?: string;
    posts?: CreatedPostInfo[];
    linkedGroupId?: string | null;
    count?: number;
}

/**
 * Buat satu Post per akun platform. Multi-platform memakai linkedGroupId.
 * Validasi dasar: caption wajib saat autoPublish, akun harus milik org, waktu jadwal masa depan.
 */
export async function createPosts(params: CreatePostParams): Promise<CreatePostResult> {
    const { organizationId, caption, platformAccountIds, mediaIds, scheduledAt, autoPublish, firstComment, platformSettings } = params;
    const parsedSettings: Record<string, PlatformSettingsInput> =
        platformSettings && typeof platformSettings === "object" ? platformSettings : {};

    const isAutoPublish = autoPublish === true;
    if (isAutoPublish && (!caption || typeof caption !== "string" || caption.trim() === "")) {
        return { status: 400, error: "Caption wajib diisi saat auto-publish." };
    }

    if (!platformAccountIds || platformAccountIds.length === 0) {
        return { status: 400, error: "Pilih minimal satu akun platform." };
    }

    const socialAccounts = await db.query.socialAccount.findMany({
        where: (t, { and: _and, eq: _eq, inArray: _in }) =>
            _and(_eq(t.organizationId, organizationId), _in(t.id, platformAccountIds)),
        columns: { id: true, platform: true },
    });
    if (socialAccounts.length !== platformAccountIds.length) {
        return { status: 400, error: "Satu atau lebih akun tidak ditemukan." };
    }

    // Validasi media milik org
    if (mediaIds?.length) {
        const media = await db.query.media.findMany({
            where: (t, { and: _and, eq: _eq, inArray: _in }) =>
                _and(_eq(t.organizationId, organizationId), _in(t.id, mediaIds)),
            columns: { id: true },
        });
        if (media.length !== mediaIds.length) {
            return { status: 400, error: "Satu atau lebih media tidak ditemukan." };
        }
    }

    let scheduledDate: Date | null = null;
    if (scheduledAt) {
        scheduledDate = new Date(scheduledAt);
        if (scheduledDate.getTime() < Date.now() - 30_000) {
            return { status: 400, error: "Waktu jadwal harus di masa depan." };
        }
    }

    const linkedGroupId = platformAccountIds.length > 1 ? randomUUID() : null;

    const createdPosts: CreatedPostInfo[] = [];

    for (const account of socialAccounts) {
        const settings = parsedSettings[account.id] || {};
        const postCaption = settings.caption || caption || "";
        const postMediaIds = settings.mediaIds || mediaIds || [];
        const platformAutoPublish = settings.autoPublish !== undefined ? settings.autoPublish : isAutoPublish;

        const postId = randomUUID();

        await db.transaction(async (tx) => {
            await tx.insert(schema.post).values({
                id: postId,
                organizationId,
                caption: postCaption,
                status: scheduledDate ? "SCHEDULED" : platformAutoPublish ? "SCHEDULED" : "DRAFT",
                scheduledAt: scheduledDate,
                autoPublish: platformAutoPublish,
                firstComment: settings.firstComment || firstComment || null,
                platform: account.platform,
                socialAccountId: account.id,
                postType: (settings.postType?.toUpperCase() as never) || "FEED",
                callToAction: settings.callToAction || null,
                pinTitle: settings.pinTitle || null,
                pinLink: settings.pinLink || null,
                boardId: settings.boardId || null,
                location: settings.location || null,
                videoTitle: settings.videoTitle || null,
                youtubeCategory: settings.youtubeCategory || null,
                youtubePlaylist: settings.youtubePlaylist || null,
                videoTags: settings.videoTags || [],
                altText: settings.altText || null,
                threadsTopicTag: settings.threadsTopicTag || null,
                linkedinVisibility: settings.linkedinVisibility || null,
                tiktokPrivacyLevel: settings.tiktokPrivacyLevel || null,
                instagramShareToFeed: settings.instagramShareToFeed ?? true,
                customMediaIds: postMediaIds,
                linkedGroupId,
            });

            if (postMediaIds.length) {
                await tx.insert(schema.postMedia).values(
                    postMediaIds.map((mediaId, index) => ({
                        id: randomUUID(),
                        postId,
                        mediaId,
                        order: index,
                    })),
                );
            }
        });

        createdPosts.push({
            id: postId,
            caption: postCaption,
            status: scheduledDate ? "scheduled" : platformAutoPublish ? "scheduled" : "draft",
            scheduledAt: scheduledDate?.toISOString() ?? null,
            createdAt: new Date().toISOString(),
            platform: account.platform,
            linkedGroupId,
        });
    }

    return { status: 201, posts: createdPosts, linkedGroupId, count: createdPosts.length };
}

/**
 * Update satu post (caption, jadwal, media, dll). Hanya post yang belum terbit.
 */
export async function updatePost(
    organizationId: string,
    postId: string,
    data: {
        caption?: string;
        scheduledAt?: string | null;
        autoPublish?: boolean;
        firstComment?: string | null;
        postType?: string;
    },
): Promise<{ ok: boolean; error?: string }> {
    const existing = await db.query.post.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, postId), _eq(t.organizationId, organizationId)),
        columns: { id: true, status: true },
    });
    if (!existing) return { ok: false, error: "Post tidak ditemukan." };
    if (existing.status === "PUBLISHED" || existing.status === "PUBLISHING") {
        return { ok: false, error: "Post sudah terbit/sedang terbit dan tidak bisa diubah." };
    }

    const values: Record<string, unknown> = {};

    if (data.caption !== undefined) values.caption = data.caption;
    if (data.autoPublish !== undefined) values.autoPublish = data.autoPublish;
    if (data.firstComment !== undefined) values.firstComment = data.firstComment;
    if (data.postType !== undefined) values.postType = data.postType.toUpperCase();

    if (data.scheduledAt !== undefined) {
        if (data.scheduledAt === null) {
            values.scheduledAt = null;
            values.status = "DRAFT";
        } else {
            const d = new Date(data.scheduledAt);
            if (d.getTime() < Date.now() - 30_000) {
                return { ok: false, error: "Waktu jadwal harus di masa depan." };
            }
            values.scheduledAt = d;
            values.status = "SCHEDULED";
        }
    }

    await db.update(schema.post).set(values).where(and(eq(schema.post.id, postId), eq(schema.post.organizationId, organizationId)));
    return { ok: true };
}

/**
 * Hapus post (beserta media & error terkait). Hanya post belum terbit.
 */
export async function deletePost(organizationId: string, postId: string): Promise<{ ok: boolean; error?: string }> {
    const existing = await db.query.post.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, postId), _eq(t.organizationId, organizationId)),
        columns: { id: true, status: true },
    });
    if (!existing) return { ok: false, error: "Post tidak ditemukan." };
    if (existing.status === "PUBLISHED" || existing.status === "PUBLISHING") {
        return { ok: false, error: "Post sudah terbit/sedang terbit dan tidak bisa dihapus." };
    }

    await db.delete(schema.post).where(and(eq(schema.post.id, postId), eq(schema.post.organizationId, organizationId)));
    return { ok: true };
}