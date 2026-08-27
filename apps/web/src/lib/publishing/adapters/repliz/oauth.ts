import type { Platform } from "@/lib/platforms";
import { getReplizClient } from "./client";

const PLATFORM_MAP: Record<string, string> = {
  INSTAGRAM: "instagram",
  INSTAGRAM_PAGE: "facebook",
  FACEBOOK: "facebook",
  TIKTOK: "tiktok",
  YOUTUBE: "youtube",
  LINKEDIN: "linkedin",
  THREADS: "threads",
  TWITTER: "twitter",
  SHOPEE: "shopee",
};

export interface OAuthConnectionResult {
  platformAccountId: string;
  platformAccountName: string;
  platform: string;
  picture?: string;
}

export class ReplizOAuth {
  private client = getReplizClient();

  isConfigured(): boolean {
    return this.client !== null;
  }

  getReplizPlatform(platform: Platform): string | null {
    return PLATFORM_MAP[platform] || null;
  }

  async getAuthorizationUrl(
    platform: Platform,
    redirectUri: string,
  ): Promise<string> {
    if (!this.client) throw new Error("Repliz client not configured");

    const p = this.getReplizPlatform(platform);
    if (!p)
      throw new Error(`Platform ${platform} not supported by Repliz OAuth`);

    const result = await this.client.authorize(p, redirectUri);
    return result.url;
  }

  async exchangeCode(
    platform: Platform,
    code: string,
    state: string,
  ): Promise<Record<string, string>> {
    if (!this.client) throw new Error("Repliz client not configured");

    const p = this.getReplizPlatform(platform);
    if (!p) throw new Error(`Platform ${platform} not supported by Repliz`);

    const result = await this.client.exchange(p, { code, state });
    return result as unknown as Record<string, string>;
  }

  async connectAccount(
    platform: Platform,
    exchangeResult: Record<string, string>,
  ): Promise<OAuthConnectionResult> {
    if (!this.client) throw new Error("Repliz client not configured");

    const p = this.getReplizPlatform(platform);
    if (!p) throw new Error(`Platform ${platform} not supported by Repliz`);

    const connected = await this.client.connect(p, exchangeResult);

    return {
      platformAccountId: connected.generatedId || connected._id,
      platformAccountName: connected.name,
      platform: connected.type,
      picture: connected.picture,
    };
  }

  async reconnectAccount(
    platform: Platform,
    accountId: string,
  ): Promise<boolean> {
    if (!this.client) throw new Error("Repliz client not configured");

    const p = this.getReplizPlatform(platform);
    if (!p) throw new Error(`Platform ${platform} not supported by Repliz`);

    try {
      await this.client.reconnect(p, accountId);
      return true;
    } catch {
      return false;
    }
  }

  async getPages(
    _platform: Platform,
    _exchangeResult: Record<string, string>,
  ): Promise<{ id: string; name: string }[]> {
    // Repliz handles page selection during connect flow
    // This is a stub — pages are managed in Repliz dashboard
    return [];
  }
}

export const replizOAuth = new ReplizOAuth();
