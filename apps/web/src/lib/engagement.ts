import { desc, eq, and, type InferSelectModel } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";

export interface EngagementSummary {
    unreadMentions: number;
    unreadMessages: number;
    unreadReviews: number;
    totalMentions: number;
    totalMessages: number;
    totalReviews: number;
    unansweredComments: number;
}

export async function getEngagementSummary(organizationId: string): Promise<EngagementSummary> {
    const [mentions, messages, reviews, comments] = await Promise.all([
        db.query.mention.findMany({
            where: (t, { eq: _eq }) => _eq(t.organizationId, organizationId),
            columns: { isRead: true },
        }),
        db.query.directMessage.findMany({
            where: (t, { eq: _eq }) => _eq(t.organizationId, organizationId),
            columns: { isRead: true, direction: true },
        }),
        db.query.review.findMany({
            where: (t, { eq: _eq }) => _eq(t.organizationId, organizationId),
            columns: { isRead: true, isReplied: true },
        }),
        db.query.comment.findMany({
            where: (t, { eq: _eq }) => _eq(t.organizationId, organizationId),
            columns: { isReplied: true },
        }),
    ]);

    // DM unread = ada pesan masuk (direction "inbound") yang belum dibaca.
    const unreadMessages = messages.filter((m) => m.direction !== "outbound" && !m.isRead).length;

    return {
        unreadMentions: mentions.filter((m) => !m.isRead).length,
        unreadMessages,
        unreadReviews: reviews.filter((r) => !r.isRead).length,
        totalMentions: mentions.length,
        totalMessages: messages.length,
        totalReviews: reviews.length,
        unansweredComments: comments.filter((c) => !c.isReplied).length,
    };
}

export type MentionWithAccount = InferSelectModel<typeof schema.mention> & {
    socialAccount: { id: string; platform: string; name: string; avatar: string | null; username: string | null };
};
export type DirectMessageWithAccount = InferSelectModel<typeof schema.directMessage> & {
    socialAccount: { id: string; platform: string; name: string; avatar: string | null; username: string | null };
};
export type ReviewWithAccount = InferSelectModel<typeof schema.review> & {
    socialAccount: { id: string; platform: string; name: string; avatar: string | null; username: string | null };
};

const accountColumns = { id: true, platform: true, name: true, avatar: true, username: true } as const;

export async function listMentions(
    organizationId: string,
    opts: { limit?: number; offset?: number; unreadOnly?: boolean; platform?: string } = {},
): Promise<MentionWithAccount[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds = [eq(schema.mention.organizationId, organizationId)];
    if (opts.unreadOnly) conds.push(eq(schema.mention.isRead, false));

    const rows = await db.query.mention.findMany({
        where: (t, { and: _and }) => _and(...conds),
        with: { socialAccount: { columns: accountColumns } },
        orderBy: [desc(schema.mention.createdAt)],
        limit,
        offset,
    });

    if (opts.platform) return rows.filter((r) => r.socialAccount.platform === opts.platform);
    return rows;
}

export async function listDirectMessages(
    organizationId: string,
    opts: { limit?: number; offset?: number; unreadOnly?: boolean; platform?: string } = {},
): Promise<DirectMessageWithAccount[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds = [eq(schema.directMessage.organizationId, organizationId)];
    if (opts.unreadOnly) conds.push(eq(schema.directMessage.isRead, false));

    const rows = await db.query.directMessage.findMany({
        where: (t, { and: _and }) => _and(...conds),
        with: { socialAccount: { columns: accountColumns } },
        orderBy: [desc(schema.directMessage.createdAt)],
        limit,
        offset,
    });

    if (opts.platform) return rows.filter((r) => r.socialAccount.platform === opts.platform);
    return rows;
}

export async function listReviews(
    organizationId: string,
    opts: { limit?: number; offset?: number; unreadOnly?: boolean; platform?: string } = {},
): Promise<ReviewWithAccount[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conds = [eq(schema.review.organizationId, organizationId)];
    if (opts.unreadOnly) conds.push(eq(schema.review.isRead, false));

    const rows = await db.query.review.findMany({
        where: (t, { and: _and }) => _and(...conds),
        with: { socialAccount: { columns: accountColumns } },
        orderBy: [desc(schema.review.createdAt)],
        limit,
        offset,
    });

    if (opts.platform) return rows.filter((r) => r.socialAccount.platform === opts.platform);
    return rows;
}

/**
 * Tandai item engagement (mention/DM/review) sebagai terbaca.
 * Hanya item milik organization aktif yang bisa diubah.
 */
export async function markEngagementRead(
    organizationId: string,
    type: "mentions" | "messages" | "reviews",
    ids: string[],
    isRead = true,
): Promise<void> {
    if (ids.length === 0) return;

    const table =
        type === "mentions" ? schema.mention : type === "messages" ? schema.directMessage : schema.review;

    await Promise.all(
        ids.map((id) =>
            db.update(table).set({ isRead }).where(and(eq(table.id, id), eq(table.organizationId, organizationId))),
        ),
    );
}
