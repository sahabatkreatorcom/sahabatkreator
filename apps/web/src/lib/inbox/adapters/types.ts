import type { Platform } from "@/lib/platforms";

export type CommentStatus = "pending" | "resolved" | "ignored" | "spam";

export interface InboxComment {
  id: string;
  organizationId: string;
  socialAccountId: string;
  platformPostId: string;
  platformCommentId: string;
  authorId: string;
  authorUsername: string;
  authorAvatar?: string | null;
  text: string;
  createdAt: Date;
  likeCount?: number;
  parentId?: string | null;
  status: CommentStatus;
  isRead: boolean;
  isReplied: boolean;
  isHidden: boolean;
  replyCount: number;
}

export interface InboxAdapter {
  readonly name: string;
  readonly priority: number;

  supportsPlatform(platform: Platform): boolean;
  isConfigured(): boolean;

  fetchComments(
    account: InboxAdapterAccount,
    platformPostId: string,
  ): Promise<{ comments: InboxComment[]; error?: string }>;

  replyToComment(
    account: InboxAdapterAccount,
    platformPostId: string,
    platformCommentId: string,
    text: string,
  ): Promise<{ success: boolean; platformCommentId?: string; error?: string }>;

  likeComment(
    account: InboxAdapterAccount,
    platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }>;

  deleteComment(
    account: InboxAdapterAccount,
    platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }>;

  hideComment(
    account: InboxAdapterAccount,
    platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }>;
}

export interface InboxAdapterAccount {
  id: string;
  organizationId: string;
  platform: Platform;
  accessToken: string;
}
