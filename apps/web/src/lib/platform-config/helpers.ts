import { type Platform, type PostType, type CallToAction, type MediaConstraints, type PlatformSpec } from "./types";
import { PLATFORM_SPECS } from "./platforms";

export function getPlatformSpec(platform: Platform): PlatformSpec {
    return PLATFORM_SPECS[platform];
}

export function getSupportedPostTypes(platform: Platform): PostType[] {
    return PLATFORM_SPECS[platform].supportedPostTypes;
}

export function getCharacterLimit(platform: Platform): number {
    return PLATFORM_SPECS[platform].characterLimits.caption.max;
}

export function isPostTypeSupported(platform: Platform, postType: PostType): boolean {
    return PLATFORM_SPECS[platform].supportedPostTypes.includes(postType);
}

export function getCallToActions(platform: Platform): CallToAction[] {
    return PLATFORM_SPECS[platform].callToActions || [];
}

export function getMediaConstraints(platform: Platform, postType: PostType): MediaConstraints | undefined {
    return PLATFORM_SPECS[platform].mediaConstraints[postType];
}

export function formatPostType(postType: PostType, platform?: Platform): string {
    if (platform) {
        const platformLabels: Partial<Record<Platform, Partial<Record<PostType, string>>>> = {
            INSTAGRAM: { feed: "Feed Post", reel: "Reel", story: "Story", carousel: "Carousel" },
            INSTAGRAM_PAGE: { feed: "Feed Post", reel: "Reel", story: "Story", carousel: "Carousel" },
            FACEBOOK: { feed: "Post", reel: "Reel", story: "Story", carousel: "Carousel" },
            YOUTUBE: { video: "Video", reel: "Short" },
            TIKTOK: { video: "Video", carousel: "Photo Mode" },
            PINTEREST: { pin: "Pin", carousel: "Carousel Pin", video: "Video Pin" },
            LINKEDIN: { feed: "Post", carousel: "Document", video: "Video", article: "Article" },
            BLUESKY: { feed: "Post", thread: "Thread" },
            THREADS: { feed: "Post", carousel: "Carousel" },
            GOOGLE_BUSINESS: { feed: "Post" },
            MANUAL: { feed: "Post", carousel: "Carousel", reel: "Reel", story: "Story", video: "Video" },
            META: { feed: "Post", reel: "Reel", story: "Story", carousel: "Carousel" },
        };
        const platformLabel = platformLabels[platform]?.[postType];
        if (platformLabel) return platformLabel;
    }

    const labels: Record<PostType, string> = {
        feed: "Post", reel: "Reel", story: "Story", carousel: "Carousel",
        pin: "Pin", video: "Video", article: "Article", thread: "Thread",
    };
    return labels[postType];
}

export function getPostTypeIcon(postType: PostType): string {
    const icons: Record<PostType, string> = {
        feed: "Image", reel: "Film", story: "Clock", carousel: "Images",
        pin: "Pin", video: "Video", article: "FileText", thread: "MessageSquare",
    };
    return icons[postType];
}

export function getPostTypeLabel(postType: PostType): string {
    const labels: Record<PostType, string> = {
        feed: "Post", reel: "Reel/Short", story: "Story", carousel: "Carousel",
        pin: "Pin", video: "Video", article: "Article", thread: "Thread",
    };
    return labels[postType];
}

export function platformSupportsCarousel(platform: Platform): boolean {
    const spec = PLATFORM_SPECS[platform];
    if (spec.supportedPostTypes.includes("carousel")) return true;
    if (platform === "BLUESKY") {
        const feedConstraints = spec.mediaConstraints.feed;
        return feedConstraints?.maxFiles ? feedConstraints.maxFiles > 1 : false;
    }
    return false;
}

export function getCarouselMaxItems(platform: Platform): number {
    const spec = PLATFORM_SPECS[platform];
    const carouselConstraints = spec.mediaConstraints.carousel;
    if (carouselConstraints?.maxFiles) return carouselConstraints.maxFiles;
    const feedConstraints = spec.mediaConstraints.feed;
    if (feedConstraints?.maxFiles) return feedConstraints.maxFiles;
    return 10;
}

export function platformSupportsMultipleMedia(platform: Platform): boolean {
    if (platform === "TIKTOK") return false;
    if (platform === "YOUTUBE") return false;
    if (platform === "GOOGLE_BUSINESS") return false;
    return platformSupportsCarousel(platform);
}
