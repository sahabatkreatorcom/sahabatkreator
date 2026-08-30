import { type Platform, type PlatformSpec } from "./types";
import { instagramSpec } from "./platforms/instagram";
import { tiktokSpec } from "./platforms/tiktok";
import { youtubeSpec } from "./platforms/youtube";
import { facebookSpec } from "./platforms/facebook";
import { pinterestSpec } from "./platforms/pinterest";
import { linkedinSpec } from "./platforms/linkedin";
import { blueskySpec } from "./platforms/bluesky";
import { threadsSpec } from "./platforms/threads";
import { googleBusinessSpec } from "./platforms/google-business";
import { manualSpec } from "./platforms/manual";

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
    INSTAGRAM: instagramSpec,
    INSTAGRAM_PAGE: instagramSpec,
    TIKTOK: tiktokSpec,
    YOUTUBE: youtubeSpec,
    FACEBOOK: facebookSpec,
    PINTEREST: pinterestSpec,
    LINKEDIN: linkedinSpec,
    BLUESKY: blueskySpec,
    THREADS: threadsSpec,
    GOOGLE_BUSINESS: googleBusinessSpec,
    MANUAL: manualSpec,
    META: facebookSpec,
};
