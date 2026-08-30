import { type PlatformSpec } from "../types";

export const tiktokSpec: PlatformSpec = {
    id: "TIKTOK",
    name: "TikTok",
    color: "#010101",
    icon: "tiktok",
    deepLink: { appUri: "tiktok://", webUrl: "https://www.tiktok.com/upload" },
    characterLimits: {
        caption: { max: 2200, recommended: 150 },
    },
    supportedPostTypes: ["video"],
    hashtagLimit: 100,
    mediaConstraints: {
        feed: {
            maxFiles: 1,
            video: {
                minDuration: 3,
                maxDuration: 600,
                maxSize: 4 * 1024 * 1024 * 1024,
                formats: ["mp4", "mov", "webm"],
                minWidth: 720,
                maxWidth: 1920,
            },
        },
        carousel: {
            maxFiles: 35,
            image: {
                minWidth: 720,
                maxWidth: 1920,
                recommendedWidth: 1080,
                aspectRatios: ["9:16", "1:1", "4:5"],
                maxSize: 20 * 1024 * 1024,
                formats: ["jpg", "jpeg", "png", "webp"],
            },
        },
    },
    features: {
        scheduledPublishing: true,
        firstComment: false,
        locationTagging: true,
        productTagging: true,
        altText: false,
    },
    variation: {
        hashtagPosition: "inline",
        linkBehavior: "bio",
        tone: "trendy, authentic, fun",
        emojiDensity: "medium",
    },
};
