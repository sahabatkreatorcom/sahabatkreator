export interface LinkMetadata {
  url: string;
  title: string;
  description: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  type?: string;
  canonical?: string;
  robots?: string;
  keywords?: string[];
}

export class LinkMetadataClient {
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

  async getMetadata(url: string): Promise<LinkMetadata> {
    const params = new URLSearchParams({ url });
    return this.request("GET", `/v1/link-metadata?${params.toString()}`);
  }

  async getMultipleMetadata(urls: string[]): Promise<LinkMetadata[]> {
    const params = new URLSearchParams({ urls: urls.join(",") });
    return this.request("GET", `/v1/link-metadata/batch?${params.toString()}`);
  }

  async generatePreviewCard(url: string): Promise<{
    html: string;
    metadata: LinkMetadata;
  }> {
    const params = new URLSearchParams({ url });
    return this.request(
      "GET",
      `/v1/link-metadata/preview?${params.toString()}`,
    );
  }
}
