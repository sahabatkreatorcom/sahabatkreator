import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { fetchComments } from "./comments";
import { getCredentialsForPlatform, refreshAccessToken, type Platform } from "@/lib/platforms";
import { decryptToken, encryptToken } from "@/lib/token-encryption";
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

                try {
                    const account = await resolveAccount(post.socialAccount);
                    const { comments, error } = await fetchComments(account, post.platformPostId);
                    if (error) throw new Error(error);

                    for (const c of comments) {
                        const upserted = await upsertComment(account, post.id, post.platformPostId, c);
                        if (upserted === "added") result.commentsAdded++;
                        else if (upserted === "updated") result.commentsUpdated++;
                    }
                } catch (e) {
                    result.failed++;
                    result.errors.push({
                        postId: post.id,
                        platform: post.platform ?? "unknown",
                        error: e instanceof Error ? e.message : "Unknown error",
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
    let token = decryptToken(account.accessToken);

    if (account.tokenExpiry && new Date() > account.tokenExpiry) {
        if (!account.refreshToken) {
            throw new Error("Token akses kedaluwarsa dan tidak ada refresh token. Hubungkan ulang akun.");
        }
        const credentials = (await getCredentialsForPlatform(account.platform)) || undefined;
        const refreshed = await refreshAccessToken(account.platform, decryptToken(account.refreshToken), credentials);
        await db.update(schema.socialAccount)
            .set({
                accessToken: encryptToken(refreshed.accessToken),
                refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : undefined,
                tokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000),
            })
            .where(eq(schema.socialAccount.id, account.id));
        token = refreshed.accessToken;
    }

    return { id: account.id, organizationId: account.organizationId, platform: account.platform, accessToken: token };
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
        platformPostId,
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
        createdAt: c.createdAt,
        syncedAt: new Date(),
    });

    return "added";
}