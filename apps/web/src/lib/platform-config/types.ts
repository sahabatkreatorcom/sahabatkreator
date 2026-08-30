export type Platform =
    | "INSTAGRAM"
    | "INSTAGRAM_PAGE"
    | "TIKTOK"
    | "YOUTUBE"
    | "FACEBOOK"
    | "PINTEREST"
    | "LINKEDIN"
    | "BLUESKY"
    | "THREADS"
    | "GOOGLE_BUSINESS"
    | "MANUAL"
    | "META";

export type PostType =
    | "feed"
    | "reel"
    | "story"
    | "carousel"
    | "pin"
    | "video"
    | "article"
    | "thread";

export interface CharacterLimits {
    caption: { max: number; recommended?: number };
    title?: { max: number };
    description?: { max: number };
    firstComment?: { max: number };
}

export interface MediaConstraints {
    maxFiles: number;
    image?: {
        minWidth: number;
        maxWidth: number;
        recommendedWidth: number;
        aspectRatios: string[];
        maxSize: number;
        formats: string[];
    };
    video?: {
        minDuration: number;
        maxDuration: number;
        maxSize: number;
        formats: string[];
        minWidth?: number;
        maxWidth?: number;
    };
}

export interface CallToAction {
    id: string;
    label: string;
}

export interface VariationConfig {
    hashtagPosition: "inline" | "end" | "first-comment";
    linkBehavior: "embed" | "bio" | "shortened";
    tone: string;
    emojiDensity: "low" | "medium" | "high";
}

export interface PlatformSpec {
    id: Platform;
    name: string;
    color: string;
    icon: string;
    characterLimits: CharacterLimits;
    supportedPostTypes: PostType[];
    mediaConstraints: Partial<Record<PostType, MediaConstraints>>;
    callToActions?: CallToAction[];
    hashtagLimit?: number;
    mentionLimit?: number;
    features: {
        scheduledPublishing: boolean;
        firstComment: boolean;
        locationTagging: boolean;
        productTagging: boolean;
        altText: boolean;
    };
    variation: VariationConfig;
    deepLink?: {
        appUri?: string;
        webUrl: string;
    };
}
