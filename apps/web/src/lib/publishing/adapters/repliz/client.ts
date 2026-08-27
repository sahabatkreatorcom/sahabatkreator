import { env } from "@sahabat-kreator/env/server";

export class ReplizError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(`Repliz API ${code}: ${message}`);
    this.name = "ReplizError";
  }
}

export interface ReplizClientConfig {
  accessKey: string;
  secretKey: string;
  baseUrl?: string;
}

export class ReplizClient {
  private auth: string;
  private baseUrl: string;

  constructor(config: ReplizClientConfig) {
    this.auth = Buffer.from(`${config.accessKey}:${config.secretKey}`).toString(
      "base64",
    );
    this.baseUrl = config.baseUrl || "https://api.repliz.com";
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new ReplizError(
        error.code || res.status,
        error.message || res.statusText,
      );
    }

    return res.json() as Promise<T>;
  }

  createSchedule(body: ReplizScheduleBody) {
    return this.request<{ scheduleId: string }>(
      "POST",
      "/public/schedule",
      body,
    );
  }

  getSchedule(id: string) {
    return this.request<ReplizSchedule>("GET", `/public/schedule/${id}`);
  }

  getAccounts(page = 1, limit = 50) {
    return this.request<ReplizAccountList>(
      "GET",
      `/public/account?page=${page}&limit=${limit}`,
    );
  }

  getAccount(id: string) {
    return this.request<ReplizAccount>("GET", `/public/account/${id}`);
  }

  getComments(params: {
    page: number;
    limit: number;
    status?: string;
    accountIds?: string[];
    search?: string;
  }) {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });
    if (params.status) query.set("status", params.status);
    if (params.accountIds) {
      for (const id of params.accountIds) {
        query.append("accountIds[]", id);
      }
    }
    if (params.search) query.set("search", params.search);
    return this.request<ReplizCommentList>("GET", `/public/comment?${query}`);
  }

  replyComment(commentId: string, text: string) {
    return this.request<{ success: boolean }>(
      "POST",
      `/public/comment/${commentId}/reply`,
      { text },
    );
  }

  updateCommentStatus(commentId: string, status: "resolved" | "ignored") {
    return this.request<{ success: boolean }>(
      "PATCH",
      `/public/comment/${commentId}/status`,
      { status },
    );
  }

  deleteComment(commentId: string) {
    return this.request<{ success: boolean }>(
      "DELETE",
      `/public/comment/${commentId}`,
    );
  }

  createAutomation(body: ReplizAutomationBody) {
    return this.request<{ automationId: string }>(
      "POST",
      "/public/automation",
      body,
    );
  }

  getContent(params: { page: number; limit: number; accountId?: string }) {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });
    if (params.accountId) query.set("accountId", params.accountId);
    return this.request<ReplizContentList>("GET", `/public/content?${query}`);
  }

  getChats(params: { page: number; limit: number; accountId?: string }) {
    const query = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });
    if (params.accountId) query.set("accountId", params.accountId);
    return this.request<ReplizChatList>("GET", `/public/chat?${query}`);
  }

  sendMessage(chatId: string, text: string) {
    return this.request<{ success: boolean }>(
      "POST",
      `/public/chat/${chatId}/message`,
      { text },
    );
  }

  authorize(platform: string, redirectUri: string) {
    return this.request<{ url: string }>(
      "GET",
      `/public/account/${platform}/authorize?redirect=${encodeURIComponent(redirectUri)}`,
    );
  }

  connect(platform: string, body: Record<string, string>) {
    return this.request<ReplizAccount>(
      "POST",
      `/public/account/${platform}/connect`,
      body,
    );
  }

  exchange(platform: string, body: Record<string, string>) {
    return this.request<{ token: string }>(
      "POST",
      `/public/account/${platform}/exchange`,
      body,
    );
  }

  reconnect(platform: string, accountId: string) {
    return this.request<{ success: boolean }>(
      "POST",
      `/public/account/${platform}/reconnect`,
      { accountId },
    );
  }
}

let _client: ReplizClient | null = null;

export function getReplizClient(): ReplizClient | null {
  if (_client) return _client;

  const accessKey = env.REPLIZ_ACCESS_KEY;
  const secretKey = env.REPLIZ_SECRET_KEY;

  if (!accessKey || !secretKey) return null;

  _client = new ReplizClient({
    accessKey,
    secretKey,
    baseUrl: env.REPLIZ_API_URL || "https://api.repliz.com",
  });

  return _client;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ReplizScheduleBody {
  title: string;
  description: string;
  type: "text" | "image" | "video" | "reel" | "album" | "link" | "story";
  medias: {
    url: string;
    type: "image" | "video";
    alt?: string;
    thumbnail?: string;
  }[];
  accountId: string;
  scheduleAt: string;
  additionalInfo?: {
    isAiGenerated?: boolean;
    collaborators?: string[];
    mentions?: string[];
    tags?: string[];
    targetCountries?: string[];
    music?: { id: string; artist: string; name: string; thumbnail: string };
    isAutoAddMusic?: boolean;
  };
  topic?: string;
  meta?: { title: string; description: string; url: string };
}

export interface ReplizSchedule {
  _id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  accountId: string;
  scheduleAt: string;
  createdAt: string;
}

export interface ReplizAccount {
  _id: string;
  generatedId: string;
  name: string;
  username: string;
  picture: string;
  isConnected: boolean;
  type: string;
  userId: string;
}

export interface ReplizAccountList {
  docs: ReplizAccount[];
  totalDocs: number;
  page: number;
  totalPages: number;
}

export interface ReplizComment {
  _id: string;
  status: "pending" | "resolved" | "ignored";
  content: {
    id: string;
    title: string;
    description: string;
    type: string;
    owner: { id: string; name: string; picture: string };
    url: string;
    createdAt: string;
  };
  comment: {
    id: string;
    type: string;
    text: string;
    owner: { id: string; name: string; picture: string };
    createdAt: string;
    replies: unknown[];
  };
  accountId: string;
  account: ReplizAccount;
}

export interface ReplizCommentList {
  docs: ReplizComment[];
  totalDocs: number;
  page: number;
  totalPages: number;
}

export interface ReplizContent {
  _id: string;
  id: string;
  title: string;
  description: string;
  type: string;
  owner: { id: string; name: string; picture: string };
  url: string;
  createdAt: string;
  statistic: { comment: number; like?: number; view?: number };
}

export interface ReplizContentList {
  docs: ReplizContent[];
  totalDocs: number;
  page: number;
  totalPages: number;
}

export interface ReplizChat {
  _id: string;
  id: string;
  platform: string;
  accountId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ReplizChatList {
  docs: ReplizChat[];
  totalDocs: number;
  page: number;
  totalPages: number;
}

export interface ReplizAutomationBody {
  contentId: string;
  accountId: string;
  config: {
    delete: {
      isActive: boolean;
      type?: string;
      keywords?: string[];
      prompt?: string;
    };
    reply: {
      isActive: boolean;
      type?: string;
      text?: string;
      prompt?: string;
      keyword?: {
        isExactMatch?: boolean;
        values?: { keyword: string; text: string }[];
      };
    };
    like: { isActive: boolean };
    message: {
      isActive: boolean;
      type?: string;
      text?: string;
      prompt?: string;
    };
    story: { isActive: boolean };
  };
}
