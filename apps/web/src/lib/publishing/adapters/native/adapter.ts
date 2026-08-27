import type { Platform } from "@/lib/platforms";
import { publishToFacebook } from "../../facebook";
import { publishToInstagram } from "../../instagram";
import { publishToLinkedIn } from "../../linkedin";
import { publishToPinterest } from "../../pinterest";
import { publishToThreads } from "../../threads";
import { publishToTikTok } from "../../tiktok";
import type {
  PlatformAccount,
  PublishPayload,
  PublishResponse,
} from "../../types";
import { publishToYouTube } from "../../youtube";
import type { PublishingAdapter } from "../types";

type PublishFn = (
  account: PlatformAccount,
  payload: PublishPayload,
) => Promise<PublishResponse>;

const PUBLISHERS: Partial<Record<Platform, PublishFn>> = {
  INSTAGRAM: publishToInstagram,
  INSTAGRAM_PAGE: publishToInstagram,
  FACEBOOK: publishToFacebook,
  TIKTOK: publishToTikTok,
  YOUTUBE: publishToYouTube,
  PINTEREST: publishToPinterest,
  LINKEDIN: publishToLinkedIn,
  THREADS: publishToThreads,
};

export class NativeAdapter implements PublishingAdapter {
  readonly name = "native";

  supportsPlatform(platform: Platform): boolean {
    return platform in PUBLISHERS;
  }

  isConfigured(): boolean {
    return true;
  }

  async publish(
    account: PlatformAccount,
    payload: PublishPayload,
  ): Promise<PublishResponse> {
    const publisher = PUBLISHERS[account.platform];
    if (!publisher) {
      return {
        success: false,
        error: `Publikasi otomatis ke ${account.platform} belum didukung.`,
        errorCode: "UNSUPPORTED_PLATFORM",
      };
    }

    try {
      return await publisher(account, payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Native publish failed";
      console.error(`[native] publish error for ${account.platform}:`, message);
      return {
        success: false,
        error: message,
        errorCode: "NATIVE_PUBLISH_ERROR",
      };
    }
  }
}

let _adapter: NativeAdapter | null = null;

export function getNativeAdapter(): NativeAdapter {
  if (!_adapter) {
    _adapter = new NativeAdapter();
  }
  return _adapter;
}
