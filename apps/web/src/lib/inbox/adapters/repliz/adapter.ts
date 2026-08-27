import type { Platform } from "@/lib/platforms";
import type {
  CommentStatus,
  InboxAdapter,
  InboxAdapterAccount,
  InboxComment,
} from "../types";
import type { ReplizCommentResponse } from "./client";
import { ReplizInboxClient } from "./client";

const SUPPORTED_PLATFORMS = new Set<Platform>([
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "META",
  "TIKTOK",
  "YOUTUBE",
  "THREADS",
  "LINKEDIN",
]);

export class ReplizInboxAdapter implements InboxAdapter {
  readonly name = "repliz";
  readonly priority = 1;

  private client: ReplizInboxClient | null = null;

  constructor(
    private accessKey?: string,
    private secretKey?: string,
    apiUrl?: string,
  ) {
    if (accessKey && secretKey) {
      this.client = new ReplizInboxClient(accessKey, secretKey, apiUrl);
    }
  }

  supportsPlatform(platform: Platform): boolean {
    return SUPPORTED_PLATFORMS.has(platform);
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.accessKey && this.secretKey);
  }

  private getClient(): ReplizInboxClient {
    if (!this.client) throw new Error("Repliz inbox adapter not configured");
    return this.client;
  }

  async fetchComments(
    account: InboxAdapterAccount,
    platformPostId: string,
  ): Promise<{ comments: InboxComment[]; error?: string }> {
    try {
      const client = this.getClient();
      const response = await client.getComments(platformPostId);

      const comments: InboxComment[] = response.comments.map((c) =>
        this.mapComment(c, account),
      );

      return { comments };
    } catch (e) {
      return {
        comments: [],
        error: e instanceof Error ? e.message : "Repliz fetch comments failed",
      };
    }
  }

  async replyToComment(
    _account: InboxAdapterAccount,
    _platformPostId: string,
    platformCommentId: string,
    text: string,
  ): Promise<{ success: boolean; platformCommentId?: string; error?: string }> {
    try {
      const client = this.getClient();
      const result = await client.replyToComment(platformCommentId, text);
      return { success: true, platformCommentId: result.reply_id };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Repliz reply failed",
      };
    }
  }

  async likeComment(
    _account: InboxAdapterAccount,
    platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient();
      await client.likeComment(platformCommentId);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Repliz like comment failed",
      };
    }
  }

  async deleteComment(
    _account: InboxAdapterAccount,
    platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient();
      await client.deleteComment(platformCommentId);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Repliz delete comment failed",
      };
    }
  }

  async hideComment(
    _account: InboxAdapterAccount,
    platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient();
      await client.hideComment(platformCommentId);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Repliz hide comment failed",
      };
    }
  }

  private mapComment(
    c: ReplizCommentResponse,
    account: InboxAdapterAccount,
  ): InboxComment {
    return {
      id: c.comment_id,
      organizationId: account.organizationId,
      socialAccountId: account.id,
      platformPostId: c.post_id,
      platformCommentId: c.comment_id,
      authorId: c.user_id,
      authorUsername: c.username,
      authorAvatar: null,
      text: c.text,
      createdAt: new Date(c.timestamp),
      likeCount: c.like_count,
      parentId: c.parent_id ?? null,
      status: "pending" as CommentStatus,
      isRead: false,
      isReplied: c.replies_count > 0,
      isHidden: false,
      replyCount: c.replies_count,
    };
  }
}
