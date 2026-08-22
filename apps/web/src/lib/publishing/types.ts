import type { Platform } from "@/lib/platforms";

export interface PlatformAccount {
    id: string;
    platform: Platform;
    accountId: string; // platformId (di social_account)
    accountName: string;
    accessToken: string;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
}

export interface PublishPayload {
    caption: string;
    mediaUrls: string[];
    mediaType: "text" | "image" | "video" | "carousel";
    postType: "feed" | "story" | "reel" | "carousel" | "pin" | "video" | "article" | "thread";
    callToAction?: string;
    firstComment?: string;
    location?: string;
    link?: string;
    boardId?: string;
    pinTitle?: string;
    thumbnailUrl?: string;
    videoTitle?: string;
    youtubeCategory?: string;
    videoTags?: string[];
    youtubePrivacy?: string;
    madeForKids?: boolean;
    notifySubscribers?: boolean;
    embeddable?: boolean;
    youtubeCommentsEnabled?: boolean;
    linkedinVisibility?: string;
    threadsTopicTag?: string;
    threadsShareToIg?: boolean;
    tiktokPrivacyLevel?: string;
    tiktokBrandOrganic?: boolean;
    tiktokBrandContent?: boolean;
    tiktokIsAigc?: boolean;
    tiktokComments?: boolean;
    tiktokDuets?: boolean;
    tiktokStitches?: boolean;
    tiktokAutoAddMusic?: boolean;
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
    instagramLocationId?: string;
    instagramUserTags?: { username: string; x?: number; y?: number }[];
    instagramCollaborators?: string[];
    isTrialReel?: boolean;
    altText?: string;
}

export interface PublishResponse {
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    errorCode?: string;
}