import { env } from "@sahabat-kreator/env/server";
import type { Platform } from "@/lib/platforms";
import { adapterRegistry } from "./adapter-registry";
import { getNativeAdapter } from "./native/adapter";
import { getReplizAdapter } from "./repliz/adapter";
import type { PublishingAdapter } from "./types";

const REPLIZ_PLATFORMS: Platform[] = [
  "INSTAGRAM",
  "INSTAGRAM_PAGE",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "LINKEDIN",
  "THREADS",
];

const NATIVE_ONLY_PLATFORMS: Platform[] = [
  "PINTEREST",
  "BLUESKY",
  "GOOGLE_BUSINESS",
];

export function initializeAdapters() {
  if (adapterRegistry.isInitialized()) return;

  const replizEnabled = env.REPLIZ_ENABLED !== "false";
  const replizAdapter = replizEnabled ? getReplizAdapter() : null;
  const nativeAdapter = getNativeAdapter();

  for (const platform of REPLIZ_PLATFORMS) {
    if (replizAdapter) {
      adapterRegistry.register(platform, replizAdapter, 1);
    }
    adapterRegistry.register(platform, nativeAdapter, replizAdapter ? 2 : 1);
  }

  for (const platform of NATIVE_ONLY_PLATFORMS) {
    adapterRegistry.register(platform, nativeAdapter, 1);
  }

  adapterRegistry.setInitialized(true);

  const adapterInfo = replizAdapter ? "Repliz + Native" : "Native only";
  console.log(`[adapters] Initialized: ${adapterInfo}`);
}

export function getAdapterForPlatform(
  platform: Platform,
): PublishingAdapter | null {
  initializeAdapters();
  return adapterRegistry.getAdapter(platform);
}

export { adapterRegistry } from "./adapter-registry";
export type { PublishingAdapter } from "./types";
