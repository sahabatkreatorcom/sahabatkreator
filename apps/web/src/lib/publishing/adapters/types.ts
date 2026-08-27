import type { Platform } from "@/lib/platforms";
import type {
  PlatformAccount,
  PublishPayload,
  PublishResponse,
} from "../types";

export interface PublishingAdapter {
  readonly name: string;

  supportsPlatform(platform: Platform): boolean;

  isConfigured(): boolean;

  publish(
    account: PlatformAccount,
    payload: PublishPayload,
  ): Promise<PublishResponse>;

  schedule?(
    account: PlatformAccount,
    payload: PublishPayload,
    scheduleAt: Date,
  ): Promise<{ scheduleId: string }>;

  getPostStatus?(
    accountId: string,
    postId: string,
  ): Promise<"pending" | "processing" | "published" | "failed">;
}

export interface AdapterEntry {
  adapter: PublishingAdapter;
  priority: number;
}
