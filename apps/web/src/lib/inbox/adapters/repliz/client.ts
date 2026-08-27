const DEFAULT_REPLIZ_URL = "https://api.repliz.com";

export interface ReplizCommentResponse {
  comment_id: string;
  post_id: string;
  text: string;
  username: string;
  user_id: string;
  timestamp: string;
  like_count: number;
  replies_count: number;
  parent_id?: string;
}

export interface ReplizReplyResponse {
  reply_id: string;
  comment_id: string;
  text: string;
  timestamp: string;
}

export interface ReplizAutomationRule {
  rule_id: string;
  platform: string;
  type: "keyword" | "ai" | "text";
  keywords?: string[];
  reply_text?: string;
  ai_prompt?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReplizInboxStats {
  total_comments: number;
  pending_comments: number;
  replied_comments: number;
  auto_replied: number;
}

export class ReplizInboxClient {
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

  async getComments(
    postId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{ comments: ReplizCommentResponse[]; next_cursor?: string }> {
    const params = new URLSearchParams({
      post_id: postId,
      limit: String(limit),
    });
    if (cursor) params.set("cursor", cursor);
    return this.request("GET", `/v1/comments?${params.toString()}`);
  }

  async replyToComment(
    commentId: string,
    text: string,
  ): Promise<ReplizReplyResponse> {
    return this.request("POST", `/v1/comments/${commentId}/reply`, { text });
  }

  async likeComment(commentId: string): Promise<{ success: boolean }> {
    return this.request("POST", `/v1/comments/${commentId}/like`);
  }

  async deleteComment(commentId: string): Promise<{ success: boolean }> {
    return this.request("DELETE", `/v1/comments/${commentId}`);
  }

  async hideComment(commentId: string): Promise<{ success: boolean }> {
    return this.request("POST", `/v1/comments/${commentId}/hide`);
  }

  async getAutomationRules(platform: string): Promise<ReplizAutomationRule[]> {
    const params = new URLSearchParams({ platform });
    return this.request("GET", `/v1/automation/rules?${params.toString()}`);
  }

  async createAutomationRule(rule: {
    platform: string;
    type: "keyword" | "ai" | "text";
    keywords?: string[];
    reply_text?: string;
    ai_prompt?: string;
  }): Promise<ReplizAutomationRule> {
    return this.request("POST", "/v1/automation/rules", rule);
  }

  async updateAutomationRule(
    ruleId: string,
    rule: Partial<{
      type: "keyword" | "ai" | "text";
      keywords: string[];
      reply_text: string;
      ai_prompt: string;
      is_active: boolean;
    }>,
  ): Promise<ReplizAutomationRule> {
    return this.request("PATCH", `/v1/automation/rules/${ruleId}`, rule);
  }

  async deleteAutomationRule(ruleId: string): Promise<{ success: boolean }> {
    return this.request("DELETE", `/v1/automation/rules/${ruleId}`);
  }

  async getInboxStats(platform: string): Promise<ReplizInboxStats> {
    const params = new URLSearchParams({ platform });
    return this.request("GET", `/v1/inbox/stats?${params.toString()}`);
  }
}
