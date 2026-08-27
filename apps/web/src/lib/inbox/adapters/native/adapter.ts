import { fetchComments as nativeFetchComments } from "@/lib/inbox/comments";
import { replyToComment as nativeReplyToComment } from "@/lib/inbox/reply";
import type { Platform } from "@/lib/platforms";
import type { InboxAdapter, InboxAdapterAccount, InboxComment } from "../types";

const SUPPORTED_PLATFORMS = new Set<Platform>([
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "META",
  "TIKTOK",
  "YOUTUBE",
  "THREADS",
]);

export class NativeInboxAdapter implements InboxAdapter {
  readonly name = "native";
  readonly priority = 2;

  supportsPlatform(platform: Platform): boolean {
    return SUPPORTED_PLATFORMS.has(platform);
  }

  isConfigured(): boolean {
    return true;
  }

  async fetchComments(
    account: InboxAdapterAccount,
    platformPostId: string,
  ): Promise<{ comments: InboxComment[]; error?: string }> {
    try {
      const result = await nativeFetchComments(
        {
          id: account.id,
          organizationId: account.organizationId,
          platform: account.platform,
          accessToken: account.accessToken,
        },
        platformPostId,
      );

      const comments: InboxComment[] = result.comments.map((c) => ({
        id: c.platformCommentId,
        organizationId: account.organizationId,
        socialAccountId: account.id,
        platformPostId,
        platformCommentId: c.platformCommentId,
        authorId: c.authorId,
        authorUsername: c.authorUsername,
        authorAvatar: c.authorAvatar,
        text: c.text,
        createdAt: c.createdAt,
        likeCount: c.likeCount,
        parentId: c.parentId ?? null,
        status: "pending" as const,
        isRead: false,
        isReplied: false,
        isHidden: false,
        replyCount: 0,
      }));

      return { comments, error: result.error };
    } catch (e) {
      return {
        comments: [],
        error: e instanceof Error ? e.message : "Native fetch comments failed",
      };
    }
  }

  async replyToComment(
    account: InboxAdapterAccount,
    platformPostId: string,
    platformCommentId: string,
    text: string,
  ): Promise<{ success: boolean; platformCommentId?: string; error?: string }> {
    try {
      const result = await nativeReplyToComment(
        {
          id: account.id,
          organizationId: account.organizationId,
          platform: account.platform,
          accessToken: account.accessToken,
        },
        platformPostId,
        platformCommentId,
        text,
      );

      return {
        success: result.success,
        platformCommentId: result.platformCommentId,
        error: result.error,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Native reply failed",
      };
    }
  }

  async likeComment(
    _account: InboxAdapterAccount,
    _platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: "Like comment not supported by native adapter",
    };
  }

  async deleteComment(
    _account: InboxAdapterAccount,
    _platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: "Delete comment not supported by native adapter",
    };
  }

  async hideComment(
    _account: InboxAdapterAccount,
    _platformCommentId: string,
  ): Promise<{ success: boolean; error?: string }> {
    return {
      success: false,
      error: "Hide comment not supported by native adapter",
    };
  }
}
