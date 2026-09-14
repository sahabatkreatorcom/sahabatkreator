// Registry adapter per platform — single source adapter lookup
// Satu file per platform di folder ini; helper bersama Meta di meta-shared.ts
import type { PlatformAdapter } from "../types";
import { blueskyAdapter } from "./bluesky";
import { facebookAdapter } from "./facebook";
import { googleBusinessAdapter } from "./google-business";
import { instagramAdapter } from "./instagram";
import { instagramStandaloneAdapter } from "./instagram-standalone";
import { linkedinAdapter } from "./linkedin";
import { pinterestAdapter } from "./pinterest";
import { replizAdapter } from "./repliz";
import { threadsAdapter } from "./threads";
import { tiktokAdapter } from "./tiktok";
import { youtubeAdapter } from "./youtube";

const ADAPTERS: Record<string, PlatformAdapter> = {
  instagram: instagramAdapter,
  instagram_standalone: instagramStandaloneAdapter,
  facebook: facebookAdapter,
  threads: threadsAdapter,
  tiktok: tiktokAdapter,
  youtube: youtubeAdapter,
  bluesky: blueskyAdapter,
  linkedin: linkedinAdapter,
  pinterest: pinterestAdapter,
  google_business: googleBusinessAdapter,
  repliz: replizAdapter,
};

export function getAdapter(platform: string): PlatformAdapter | undefined {
  return ADAPTERS[platform];
}

export function supportedPlatforms(): string[] {
  return Object.keys(ADAPTERS);
}
