import type { Platform } from "@/lib/platforms";
import type {
  DMAdapter,
  DMAdapterAccount,
  DMAttachment,
  DMConversation,
  DMMessage,
} from "../types";
import type { ReplizConversationResponse, ReplizDMResponse } from "./client";
import { ReplizDMClient } from "./client";

const SUPPORTED_PLATFORMS = new Set<Platform>([
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "META",
  "TIKTOK",
  "LINKEDIN",
]);

export class ReplizDMAdapter implements DMAdapter {
  readonly name = "repliz";
  readonly priority = 1;

  private client: ReplizDMClient | null = null;

  constructor(
    private accessKey?: string,
    private secretKey?: string,
    apiUrl?: string,
  ) {
    if (accessKey && secretKey) {
      this.client = new ReplizDMClient(accessKey, secretKey, apiUrl);
    }
  }

  supportsPlatform(platform: Platform): boolean {
    return SUPPORTED_PLATFORMS.has(platform);
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.accessKey && this.secretKey);
  }

  private getClient(): ReplizDMClient {
    if (!this.client) throw new Error("Repliz DM adapter not configured");
    return this.client;
  }

  async fetchConversations(
    account: DMAdapterAccount,
    limit = 20,
    cursor?: string,
  ): Promise<{
    conversations: DMConversation[];
    nextCursor?: string;
    error?: string;
  }> {
    try {
      const client = this.getClient();
      const platform = account.platform.toLowerCase().replace("_page", "");
      const response = await client.getConversations(platform, limit, cursor);

      const conversations: DMConversation[] = response.conversations.map((c) =>
        this.mapConversation(c, account),
      );

      return { conversations, nextCursor: response.next_cursor };
    } catch (e) {
      return {
        conversations: [],
        error:
          e instanceof Error ? e.message : "Repliz fetch conversations failed",
      };
    }
  }

  async fetchMessages(
    _account: DMAdapterAccount,
    conversationId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ messages: DMMessage[]; nextCursor?: string; error?: string }> {
    try {
      const client = this.getClient();
      const response = await client.getMessages(conversationId, limit, cursor);

      const messages: DMMessage[] = response.messages.map((m) =>
        this.mapMessage(m, conversationId),
      );

      return { messages, nextCursor: response.next_cursor };
    } catch (e) {
      return {
        messages: [],
        error: e instanceof Error ? e.message : "Repliz fetch messages failed",
      };
    }
  }

  async sendMessage(
    _account: DMAdapterAccount,
    conversationId: string,
    text: string,
    attachments?: DMAttachment[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const client = this.getClient();
      const result = await client.sendMessage(
        conversationId,
        text,
        attachments?.map((a) => ({
          type: a.type,
          url: a.url,
          mime_type: a.mimeType,
          file_name: a.fileName,
        })),
      );
      return { success: true, messageId: result.message_id };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Repliz send message failed",
      };
    }
  }

  async markAsRead(
    _account: DMAdapterAccount,
    conversationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient();
      await client.markAsRead(conversationId);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Repliz mark as read failed",
      };
    }
  }

  async archiveConversation(
    _account: DMAdapterAccount,
    conversationId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const client = this.getClient();
      await client.archiveConversation(conversationId);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error:
          e instanceof Error ? e.message : "Repliz archive conversation failed",
      };
    }
  }

  private mapConversation(
    c: ReplizConversationResponse,
    account: DMAdapterAccount,
  ): DMConversation {
    return {
      id: c.conversation_id,
      platform: account.platform,
      platformConversationId: c.conversation_id,
      participantId: c.participant_id,
      participantUsername: c.participant_username,
      participantAvatar: c.participant_avatar ?? null,
      lastMessage: c.last_message,
      lastMessageAt: new Date(c.last_message_at),
      unreadCount: c.unread_count,
      status: c.unread_count > 0 ? "unread" : "read",
    };
  }

  private mapMessage(m: ReplizDMResponse, conversationId: string): DMMessage {
    return {
      id: m.message_id,
      conversationId,
      senderId: m.sender_id,
      senderUsername: m.sender_username,
      senderAvatar: null,
      text: m.text,
      timestamp: new Date(m.timestamp),
      isFromBot: m.is_from_bot,
      attachments: m.attachments?.map((a) => ({
        type: a.type,
        url: a.url,
        mimeType: a.mime_type,
        fileName: a.file_name,
      })),
    };
  }
}
