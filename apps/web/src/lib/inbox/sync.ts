import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { type Platform } from "@/lib/platforms";
import { refreshAccountTokenIfNeeded } from "@/lib/platforms/token-refresh";
import { processAutomationForComment } from "@/lib/inbox-automation";
import { getInboxAdapterRegistry } from "./adapters";
import type { InboxAccount } from "./types";

export interface InboxSyncResult {
    postsChecked: number;
    commentsAdded: number;
    commentsUpdated: number;
    failed: number;
    errors: { postId: string; platform: string; error: string }[];
}

/**
 * Sinkronkan komentar untuk semua post PUBLISHED di org.
 * - Hanya platform yang didukung (IG, IG_PAGE, FB, TikTok, YT, Threads).
 * - Token di-decrypt; bila kedaluwarsa, coba refresh dulu.
 * - Upsert per (socialAccountId, platformCommentId); tautkan parentId bila ada.
 */
export async function syncOrganizationComments(organizationId: string): Promise<InboxSyncResult> {
    const result: InboxSyncResult = { postsChecked: 0, commentsAdded: 0, commentsUpdated: 0, failed: 0, errors: [] };

    const posts = await db.query.post.findMany({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.status, "PUBLISHED")),
        with: { socialAccount: true },
        columns: { id: true, platform: true, platformPostId: true, socialAccountId: true },
        limit: 100,
    });

    const BATCH = 5;
    for (let i = 0; i < posts.length; i += BATCH) {
        const batch = posts.slice(i, i + BATCH);
        await Promise.all(
            batch.map(async (post) => {
                result.postsChecked++;
                if (!post.socialAccount || !post.platformPostId) return;

                // TikTok sandbox: post ditandai PUBLISHED tapi belum punya video ID asli
                // (platformPostId = tiktok_pending:...). Skip sampai ID asli ada.
                if (post.platformPostId.startsWith("tiktok_pending:")) return;

                try {
                    const account = await resolveAccount(post.socialAccount);
                    const registry = getInboxAdapterRegistry();
                    const adapter = registry.getAdapter(account.platform);
                    if (!adapter) return;

                    const { comments, error } = await adapter.fetchComments(account, post.platformPostId);
                    if (error) throw new Error(error);

                    for (const c of comments) {
                        const upserted = await upsertComment(account, post.id, post.platformPostId, c);
                        if (upserted === "added") {
                            result.commentsAdded++;
                            // Auto-reply (M6) untuk komentar baru yang cocok keyword.
                            await processAutomationForComment({
                                organizationId: account.organizationId,
                                socialAccountId: account.id,
                                platform: account.platform,
                                platformPostId: post.platformPostId,
                                platformCommentId: c.platformCommentId,
                                authorUsername: c.authorUsername,
                                text: c.text,
                            });
                        } else if (upserted === "updated") {
                            result.commentsUpdated++;
                        }
                    }
                } catch (e) {
                    result.failed++;
                    const errMsg = e instanceof Error ? e.message : "Unknown error";
                    console.error(
                        `[inbox-sync] gagal post=${post.id} platform=${post.platform ?? "unknown"} postId=${post.platformPostId}: ${errMsg}`,
                    );
                    result.errors.push({
                        postId: post.id,
                        platform: post.platform ?? "unknown",
                        error: errMsg,
                    });
                }
            }),
        );

        if (i + BATCH < posts.length) await new Promise((r) => setTimeout(r, 200));
    }

    return result;
}

async function resolveAccount(account: {
    id: string;
    organizationId: string;
    platform: Platform;
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiry?: Date | null;
}): Promise<InboxAccount> {
    const refreshed = await refreshAccountTokenIfNeeded({
        id: account.id,
        platform: account.platform,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        tokenExpiry: account.tokenExpiry,
    });
    if (refreshed.needReconnect) {
        throw new Error(refreshed.error);
    }

    return {
        id: account.id,
        organizationId: account.organizationId,
        platform: account.platform,
        accessToken: refreshed.token,
    };
}

export interface IncomingComment {
    platformCommentId: string;
    platformPostId: string;
    authorId: string;
    authorUsername: string;
    authorAvatar?: string | null;
    text: string;
    createdAt?: Date;
    likeCount?: number;
    parentId?: string | null;
}

/**
 * Upsert satu komentar (dari webhook real-time atau sync berkala).
 * Return: "added" | "updated" | "skipped".
 */
export async function upsertIncomingComment(
    account: InboxAccount,
    postId: string | null,
    c: IncomingComment,
): Promise<"added" | "updated" | "skipped"> {
    if (!c.platformCommentId || !c.platformPostId) return "skipped";

    const existing = await db.query.comment.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.socialAccountId, account.id), _eq(t.platformCommentId, c.platformCommentId)),
        columns: { id: true, parentId: true },
    });

    if (existing) {
        await db.update(schema.comment)
            .set({
                text: c.text,
                authorAvatar: c.authorAvatar ?? null,
                likeCount: c.likeCount ?? 0,
                isHidden: false,
                syncedAt: new Date(),
            })
            .where(eq(schema.comment.id, existing.id));
        return "updated";
    }

    // Cari internal id parent bila komentar platform menyebut parentId.
    let parentDbId: string | null = null;
    const parentCommentId = c.parentId;
    if (parentCommentId) {
        const parent = await db.query.comment.findFirst({
            where: (t, { and: _and, eq: _eq }) =>
                _and(_eq(t.socialAccountId, account.id), _eq(t.platformCommentId, parentCommentId)),
            columns: { id: true },
        });
        parentDbId = parent?.id ?? null;
    }

    await db.insert(schema.comment).values({
        id: randomUUID(),
        organizationId: account.organizationId,
        socialAccountId: account.id,
        postId,
        platformPostId: c.platformPostId,
        platformCommentId: c.platformCommentId,
        authorId: c.authorId,
        authorUsername: c.authorUsername,
        authorAvatar: c.authorAvatar ?? null,
        text: c.text,
        likeCount: c.likeCount ?? 0,
        parentId: parentDbId,
        isRead: false,
        isReplied: false,
        isHidden: false,
        createdAt: c.createdAt ?? new Date(),
        syncedAt: new Date(),
    });

    return "added";
}

async function upsertComment(
    account: InboxAccount,
    postId: string,
    platformPostId: string,
    c: {
        platformCommentId: string;
        authorId: string;
        authorUsername: string;
        authorAvatar?: string | null;
        text: string;
        createdAt: Date;
        likeCount?: number;
        parentId?: string | null;
    },
): Promise<"added" | "updated" | "skipped"> {
    return upsertIncomingComment(account, postId, {
        platformCommentId: c.platformCommentId,
        platformPostId,
        authorId: c.authorId,
        authorUsername: c.authorUsername,
        authorAvatar: c.authorAvatar ?? null,
        text: c.text,
        createdAt: c.createdAt,
        likeCount: c.likeCount ?? 0,
        parentId: c.parentId ?? null,
    });
}