export interface ShopeeProduct {
  itemId: string;
  name: string;
  price: number;
  priceFormatted: string;
  currency: string;
  image: string;
  images: string[];
  stock: number;
  sold: number;
  rating: number;
  ratingCount: number;
  shopId: string;
  shopName: string;
  shopAvatar?: string;
  category: string;
  description: string;
  url: string;
}

export interface ShopeeSearchResult {
  products: ShopeeProduct[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface ShopeeAffiliateLink {
  originalUrl: string;
  affiliateUrl: string;
  commission: number;
  expiresAt: string;
}

export class ShopeeClient {
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

  async searchProducts(
    query: string,
    limit = 20,
    page = 1,
    sort?: "relevancy" | "sales" | "price_asc" | "price_desc",
  ): Promise<ShopeeSearchResult> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      page: String(page),
    });
    if (sort) params.set("sort", sort);
    return this.request(
      "GET",
      `/v1/shopee/products/search?${params.toString()}`,
    );
  }

  async getProduct(itemId: string, shopId?: string): Promise<ShopeeProduct> {
    const params = new URLSearchParams({ item_id: itemId });
    if (shopId) params.set("shop_id", shopId);
    return this.request("GET", `/v1/shopee/products?${params.toString()}`);
  }

  async getFlashSale(limit = 20): Promise<ShopeeProduct[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const result = await this.request<{ products: ShopeeProduct[] }>(
      "GET",
      `/v1/shopee/flash-sale?${params.toString()}`,
    );
    return result.products;
  }

  async getDailyDiscover(limit = 20): Promise<ShopeeProduct[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const result = await this.request<{ products: ShopeeProduct[] }>(
      "GET",
      `/v1/shopee/daily-discover?${params.toString()}`,
    );
    return result.products;
  }

  async generateAffiliateLink(
    productUrl: string,
    campaignId?: string,
  ): Promise<ShopeeAffiliateLink> {
    return this.request("POST", "/v1/shopee/affiliate/link", {
      product_url: productUrl,
      campaign_id: campaignId,
    });
  }

  async getAffiliateStats(
    startDate: string,
    endDate: string,
  ): Promise<{
    totalClicks: number;
    totalOrders: number;
    totalCommission: number;
    topProducts: Array<{ itemId: string; name: string; commission: number }>;
  }> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.request(
      "GET",
      `/v1/shopee/affiliate/stats?${params.toString()}`,
    );
  }
}
