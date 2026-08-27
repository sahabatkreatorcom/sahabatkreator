import type { Platform } from "@/lib/platforms";
import type {
  PlatformAccount,
  PublishPayload,
  PublishResponse,
} from "../../types";
import type { PublishingAdapter } from "../types";
import { getReplizClient, type ReplizClient } from "./client";
import { mapToReplizSchedule } from "./mapper";

const REPLIZ_PLATFORMS: Platform[] = [
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "LINKEDIN",
  "THREADS",
];

export class ReplizAdapter implements PublishingAdapter {
  readonly name = "repliz";
  private client: ReplizClient;

  constructor(client: ReplizClient) {
    this.client = client;
  }

  supportsPlatform(platform: Platform): boolean {
    return REPLIZ_PLATFORMS.includes(platform);
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async publish(
    account: PlatformAccount,
    payload: PublishPayload,
  ): Promise<PublishResponse> {
    try {
      const body = mapToReplizSchedule(account.accountId, payload);
      body.scheduleAt = new Date().toISOString();

      const result = await this.client.createSchedule(body);

      return {
        success: true,
        postId: result.scheduleId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Repliz publish failed";
      console.error(`[repliz] publish error:`, message);
      return {
        success: false,
        error: message,
        errorCode: "REPLIZ_PUBLISH_ERROR",
      };
    }
  }

  async schedule(
    account: PlatformAccount,
    payload: PublishPayload,
    scheduleAt: Date,
  ): Promise<{ scheduleId: string }> {
    const body = mapToReplizSchedule(account.accountId, payload);
    body.scheduleAt = scheduleAt.toISOString();

    const result = await this.client.createSchedule(body);
    return { scheduleId: result.scheduleId };
  }

  async getPostStatus(
    _accountId: string,
    postId: string,
  ): Promise<"pending" | "processing" | "published" | "failed"> {
    try {
      const schedule = await this.client.getSchedule(postId);
      if (schedule.status === "published") return "published";
      if (schedule.status === "failed") return "failed";
      if (schedule.status === "processing") return "processing";
      return "pending";
    } catch {
      return "pending";
    }
  }
}

let _adapter: ReplizAdapter | null = null;

export function getReplizAdapter(): ReplizAdapter | null {
  if (_adapter) return _adapter;

  const client = getReplizClient();
  if (!client) return null;

  _adapter = new ReplizAdapter(client);
  return _adapter;
}
