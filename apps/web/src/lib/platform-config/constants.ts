import { type Platform } from "./types";

export const PLATFORM_ORDER: Platform[] = [
    "GOOGLE_BUSINESS",
    "FACEBOOK",
    "INSTAGRAM",
    "THREADS",
    "YOUTUBE",
    "TIKTOK",
    "PINTEREST",
    "BLUESKY",
    "LINKEDIN",
    "MANUAL",
];

export function sortPlatformsByOrder(platforms: Platform[]): Platform[] {
    return [...platforms].sort((a, b) => {
        const indexA = PLATFORM_ORDER.indexOf(a);
        const indexB = PLATFORM_ORDER.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
}

export function getPlatformSortIndex(platform: Platform): number {
    const index = PLATFORM_ORDER.indexOf(platform);
    return index === -1 ? 999 : index;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
    INSTAGRAM: "Instagram",
    INSTAGRAM_PAGE: "Instagram (via Page)",
    FACEBOOK: "Facebook",
    META: "Meta",
    TIKTOK: "TikTok",
    YOUTUBE: "YouTube",
    PINTEREST: "Pinterest",
    GOOGLE_BUSINESS: "Google Business",
    LINKEDIN: "LinkedIn",
    BLUESKY: "Bluesky",
    THREADS: "Threads",
    MANUAL: "Manual",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
    INSTAGRAM: "#E4405F",
    INSTAGRAM_PAGE: "#E4405F",
    FACEBOOK: "#1877F2",
    META: "#0668E1",
    TIKTOK: "#010101",
    YOUTUBE: "#FF0000",
    PINTEREST: "#BD081C",
    GOOGLE_BUSINESS: "#4285F4",
    LINKEDIN: "#0A66C2",
    BLUESKY: "#0085FF",
    THREADS: "#000000",
    MANUAL: "#6B7280",
};

export const PLATFORM_RATE_LIMITS: Record<Platform, { daily: number; hourly?: number }> = {
    INSTAGRAM: { daily: 25, hourly: 10 },
    INSTAGRAM_PAGE: { daily: 25, hourly: 10 },
    FACEBOOK: { daily: 50 },
    META: { daily: 50 },
    TIKTOK: { daily: 30 },
    YOUTUBE: { daily: 50 },
    PINTEREST: { daily: 150, hourly: 50 },
    LINKEDIN: { daily: 100 },
    BLUESKY: { daily: 300 },
    THREADS: { daily: 250 },
    GOOGLE_BUSINESS: { daily: 10 },
    MANUAL: { daily: 999 },
};
