/**
 * Platform constants yang aman digunakan di client component.
 * Tidak mengimpor db atau module server-side lainnya.
 */
import type { Platform } from "./config";

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

export const CONNECTABLE_PLATFORMS: Platform[] = [
    "INSTAGRAM",
    "INSTAGRAM_PAGE",
    "FACEBOOK",
    "TIKTOK",
    "YOUTUBE",
    "PINTEREST",
    "GOOGLE_BUSINESS",
    "LINKEDIN",
    "THREADS",
];

export type { Platform };
