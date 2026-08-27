export interface TikTokTrendingMusic {
  id: string;
  title: string;
  artist: string;
  albumCover?: string;
  duration: number;
  usageCount: number;
  trendScore: number;
  genre?: string;
  releaseDate?: string;
}

export interface TikTokMusicSearchResult {
  music: TikTokTrendingMusic[];
  total: number;
  page: number;
  hasMore: boolean;
}

export class TikTokMusicClient {
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

  async getTrendingMusic(
    region = "ID",
    limit = 20,
    page = 1,
  ): Promise<TikTokMusicSearchResult> {
    const params = new URLSearchParams({
      region,
      limit: String(limit),
      page: String(page),
    });
    return this.request(
      "GET",
      `/v1/tiktok/music/trending?${params.toString()}`,
    );
  }

  async searchMusic(
    query: string,
    region = "ID",
    limit = 20,
  ): Promise<TikTokMusicSearchResult> {
    const params = new URLSearchParams({
      q: query,
      region,
      limit: String(limit),
    });
    return this.request("GET", `/v1/tiktok/music/search?${params.toString()}`);
  }

  async getMusicById(musicId: string): Promise<TikTokTrendingMusic> {
    return this.request("GET", `/v1/tiktok/music/${musicId}`);
  }

  async getMusicUsageStats(musicId: string): Promise<{
    totalVideos: number;
    totalViews: number;
    avgEngagement: number;
    topCreators: Array<{ username: string; viewCount: number }>;
  }> {
    return this.request("GET", `/v1/tiktok/music/${musicId}/stats`);
  }
}
