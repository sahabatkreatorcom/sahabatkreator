import type { Platform } from "@/lib/platforms";

/** Komentar mentah dari platform, sebelum di-insert ke DB. */
export interface PlatformComment {
    platformCommentId: string;
    authorId: string;
    authorUsername: string;
    authorAvatar?: string | null;
    text: string;
    createdAt: Date;
    likeCount?: number;
    parentId?: string | null;
}

export interface ReplyResult {
    success: boolean;
    platformCommentId?: string;
    error?: string;
}

/** Akun + token valid yang dipakai untuk panggilan API inbox. */
export interface InboxAccount {
    id: string;
    organizationId: string;
    platform: Platform;
    accessToken: string;
}