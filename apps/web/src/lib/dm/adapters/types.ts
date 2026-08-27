import type { Platform } from "@/lib/platforms";

export type DMStatus = "unread" | "read" | "replied" | "archived";

export interface DMMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string | null;
  text: string;
  timestamp: Date;
  isFromBot: boolean;
  attachments?: DMAttachment[];
}

export interface DMAttachment {
  type: "image" | "video" | "audio" | "file" | "link";
  url: string;
  mimeType?: string;
  fileName?: string;
}

export interface DMConversation {
  id: string;
  platform: Platform;
  platformConversationId: string;
  participantId: string;
  participantUsername: string;
  participantAvatar?: string | null;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
  status: DMStatus;
}

export interface DMAutoReplyRule {
  id: string;
  organizationId: string;
  platform: Platform;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  replyText?: string;
  aiPrompt?: string;
  isActive: boolean;
  delayMs?: number;
  exceptionKeywords?: string[];
}

export interface DMAdapter {
  readonly name: string;
  readonly priority: number;

  supportsPlatform(platform: Platform): boolean;
  isConfigured(): boolean;

  fetchConversations(
    account: DMAdapterAccount,
    limit?: number,
    cursor?: string,
  ): Promise<{
    conversations: DMConversation[];
    nextCursor?: string;
    error?: string;
  }>;

  fetchMessages(
    account: DMAdapterAccount,
    conversationId: string,
    limit?: number,
    cursor?: string,
  ): Promise<{ messages: DMMessage[]; nextCursor?: string; error?: string }>;

  sendMessage(
    account: DMAdapterAccount,
    conversationId: string,
    text: string,
    attachments?: DMAttachment[],
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  markAsRead(
    account: DMAdapterAccount,
    conversationId: string,
  ): Promise<{ success: boolean; error?: string }>;

  archiveConversation(
    account: DMAdapterAccount,
    conversationId: string,
  ): Promise<{ success: boolean; error?: string }>;
}

export interface DMAdapterAccount {
  id: string;
  organizationId: string;
  platform: Platform;
  accessToken: string;
}
