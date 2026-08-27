const DEFAULT_REPLIZ_URL = "https://api.repliz.com";

export interface ReplizConversationResponse {
  conversation_id: string;
  platform: string;
  participant_id: string;
  participant_username: string;
  participant_avatar?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface ReplizDMResponse {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  text: string;
  timestamp: string;
  is_from_bot: boolean;
  attachments?: ReplizDMAttachmentResponse[];
}

export interface ReplizDMAttachmentResponse {
  type: "image" | "video" | "audio" | "file" | "link";
  url: string;
  mime_type?: string;
  file_name?: string;
}

export interface ReplizDMAutoReplyRule {
  rule_id: string;
  platform: string;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  reply_text?: string;
  ai_prompt?: string;
  is_active: boolean;
  delay_ms?: number;
  exception_keywords?: string[];
  created_at: string;
  updated_at: string;
}

export class ReplizDMClient {
  private baseUrl: string;
  private headers: { Authorization: string; "Content-Type": string };

  constructor(accessKey: string, secretKey: string, apiUrl?: string) {
    this.baseUrl = apiUrl || DEFAULT_REPLIZ_URL;
    const token = Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
    this.headers = {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const options: RequestInit = { method, headers: this.headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, options);
    const data = await res.json();

    if (!res.ok) {
      const msg =
        (data as { message?: string }).message ||
        `Repliz API error ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  }

  async getConversations(
    platform: string,
    limit = 20,
    cursor?: string,
  ): Promise<{
    conversations: ReplizConversationResponse[];
    next_cursor?: string;
  }> {
    const params = new URLSearchParams({ platform, limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return this.request("GET", `/v1/dm/conversations?${params.toString()}`);
  }

  async getMessages(
    conversationId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ messages: ReplizDMResponse[]; next_cursor?: string }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return this.request(
      "GET",
      `/v1/dm/conversations/${conversationId}/messages?${params.toString()}`,
    );
  }

  async sendMessage(
    conversationId: string,
    text: string,
    attachments?: Array<{
      type: string;
      url: string;
      mime_type?: string;
      file_name?: string;
    }>,
  ): Promise<ReplizDMResponse> {
    return this.request(
      "POST",
      `/v1/dm/conversations/${conversationId}/messages`,
      {
        text,
        attachments,
      },
    );
  }

  async markAsRead(conversationId: string): Promise<{ success: boolean }> {
    return this.request("POST", `/v1/dm/conversations/${conversationId}/read`);
  }

  async archiveConversation(
    conversationId: string,
  ): Promise<{ success: boolean }> {
    return this.request(
      "POST",
      `/v1/dm/conversations/${conversationId}/archive`,
    );
  }

  async getAutoReplyRules(platform: string): Promise<ReplizDMAutoReplyRule[]> {
    const params = new URLSearchParams({ platform });
    return this.request("GET", `/v1/dm/auto-reply/rules?${params.toString()}`);
  }

  async createAutoReplyRule(rule: {
    platform: string;
    type: "keyword" | "ai" | "text";
    keywords?: string[];
    reply_text?: string;
    ai_prompt?: string;
    delay_ms?: number;
    exception_keywords?: string[];
  }): Promise<ReplizDMAutoReplyRule> {
    return this.request("POST", "/v1/dm/auto-reply/rules", rule);
  }

  async updateAutoReplyRule(
    ruleId: string,
    rule: Partial<{
      type: "keyword" | "ai" | "text";
      keywords: string[];
      reply_text: string;
      ai_prompt: string;
      is_active: boolean;
      delay_ms: number;
      exception_keywords: string[];
    }>,
  ): Promise<ReplizDMAutoReplyRule> {
    return this.request("PATCH", `/v1/dm/auto-reply/rules/${ruleId}`, rule);
  }

  async deleteAutoReplyRule(ruleId: string): Promise<{ success: boolean }> {
    return this.request("DELETE", `/v1/dm/auto-reply/rules/${ruleId}`);
  }

  async sendCommentToDM(
    commentId: string,
    userId: string,
    text: string,
  ): Promise<{ success: boolean; conversation_id?: string }> {
    return this.request("POST", "/v1/dm/comment-to-dm", {
      comment_id: commentId,
      user_id: userId,
      text,
    });
  }
}
