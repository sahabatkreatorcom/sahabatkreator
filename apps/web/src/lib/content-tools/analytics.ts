export interface ContentAnalyticsPost {
  postId: string;
  platform: string;
  publishedAt: string;
  impressions: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  views?: number;
  watchTime?: number;
  completionRate?: number;
  clicks?: number;
  ctr?: number;
}

export interface ContentAnalyticsAccount {
  accountId: string;
  platform: string;
  followers: number;
  followersGrowth: number;
  followersGrowthRate: number;
  engagementRate: number;
  avgImpressions: number;
  avgReach: number;
  topPost: ContentAnalyticsPost;
  recentPosts: ContentAnalyticsPost[];
}

export interface ContentAnalyticsSummary {
  totalImpressions: number;
  totalReach: number;
  totalEngagement: number;
  avgEngagementRate: number;
  topPerformingPost: ContentAnalyticsPost;
  worstPerformingPost: ContentAnalyticsPost;
  bestTimeToPost: { day: string; hour: number };
  contentMix: {
    images: number;
    videos: number;
    carousels: number;
    reels: number;
    stories: number;
  };
}

export class ContentAnalyticsClient {
  private baseUrl: string;
  private headers: { Authorization: string; "Content-Type": string };

  constructor(accessKey: string, secretKey: string, apiUrl?: string) {
    this.baseUrl = apiUrl || "https://api.repliz.com";
    const token = Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
    this.headers = {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(method: string, path: string): Promise<T> {
    const options: RequestInit = { method, headers: this.headers };
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

  async getPostAnalytics(
    postId: string,
    platform: string,
  ): Promise<ContentAnalyticsPost> {
    const params = new URLSearchParams({ platform });
    return this.request(
      "GET",
      `/v1/analytics/posts/${postId}?${params.toString()}`,
    );
  }

  async getAccountAnalytics(
    accountId: string,
    platform: string,
    period = "30d",
  ): Promise<ContentAnalyticsAccount> {
    const params = new URLSearchParams({ platform, period });
    return this.request(
      "GET",
      `/v1/analytics/accounts/${accountId}?${params.toString()}`,
    );
  }

  async getSummary(
    organizationId: string,
    period = "30d",
  ): Promise<ContentAnalyticsSummary> {
    const params = new URLSearchParams({ period });
    return this.request(
      "GET",
      `/v1/analytics/summary/${organizationId}?${params.toString()}`,
    );
  }

  async getPerformanceComparison(
    accountId: string,
    platform: string,
    period1: string,
    period2: string,
  ): Promise<{
    period1: ContentAnalyticsAccount;
    period2: ContentAnalyticsAccount;
    changes: {
      followers: number;
      engagement: number;
      impressions: number;
      reach: number;
    };
  }> {
    const params = new URLSearchParams({
      platform,
      period1,
      period2,
    });
    return this.request(
      "GET",
      `/v1/analytics/compare/${accountId}?${params.toString()}`,
    );
  }

  async getBestPostingTimes(
    accountId: string,
    platform: string,
  ): Promise<{
    bestDays: Array<{ day: string; engagementRate: number }>;
    bestHours: Array<{ hour: number; engagementRate: number }>;
    worstTimes: Array<{ day: string; hour: number; engagementRate: number }>;
  }> {
    const params = new URLSearchParams({ platform });
    return this.request(
      "GET",
      `/v1/analytics/best-times/${accountId}?${params.toString()}`,
    );
  }
}
