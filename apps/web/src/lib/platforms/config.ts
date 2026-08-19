export const GRAPH_API_URL = "https://graph.facebook.com/v26.0";
export const META_OAUTH_VERSION = "v26.0";

export type Platform =
    | "INSTAGRAM"
    | "INSTAGRAM_PAGE"
    | "FACEBOOK"
    | "META"
    | "TIKTOK"
    | "YOUTUBE"
    | "PINTEREST"
    | "GOOGLE_BUSINESS"
    | "LINKEDIN"
    | "BLUESKY"
    | "THREADS"
    | "MANUAL";

/** Platform yang bisa dihubungkan via OAuth. MANUAL & META tidak connect langsung. */
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

/** URL dasar Graph API Instagram standalone vs yang tertaut Facebook Page. */
export const INSTAGRAM_GRAPH_URL = "https://graph.instagram.com/v26.0";
export const INSTAGRAM_OAUTH_URL = "https://api.instagram.com/oauth";

export interface PlatformOAuthConfig {
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
    apiBase: string;
}

/** Credential key di global_platform_credential (enum db). */
export function credentialPlatform(p: Platform): Platform {
    if (p === "INSTAGRAM_PAGE" || p === "FACEBOOK") return "META";
    return p;
}

export const PLATFORM_OAUTH_CONFIGS: Record<Platform, PlatformOAuthConfig> = {
    INSTAGRAM: {
        authUrl: `${INSTAGRAM_OAUTH_URL}/authorize`,
        tokenUrl: `${INSTAGRAM_OAUTH_URL}/access_token`,
        scopes: [
            "instagram_business_basic",
            "instagram_business_content_publish",
            "instagram_business_manage_comments",
            "instagram_business_manage_insights",
            "instagram_business_manage_messages",
        ],
        apiBase: INSTAGRAM_GRAPH_URL,
    },
    INSTAGRAM_PAGE: {
        authUrl: `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth`,
        tokenUrl: `${GRAPH_API_URL}/oauth/access_token`,
        scopes: [
            "instagram_basic",
            "instagram_content_publish",
            "instagram_manage_comments",
            "instagram_manage_insights",
            "instagram_manage_messages",
            "pages_show_list",
            "pages_read_engagement",
            "business_management",
        ],
        apiBase: GRAPH_API_URL,
    },
    FACEBOOK: {
        authUrl: `https://www.facebook.com/${META_OAUTH_VERSION}/dialog/oauth`,
        tokenUrl: `${GRAPH_API_URL}/oauth/access_token`,
        scopes: [
            "public_profile",
            "pages_manage_posts",
            "publish_video",
            "pages_read_engagement",
            "pages_manage_engagement",
            "pages_show_list",
            "business_management",
            "read_insights",
        ],
        apiBase: GRAPH_API_URL,
    },
    TIKTOK: {
        authUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        scopes: ["user.info.profile", "user.info.stats", "video.publish", "video.upload", "video.list"],
        apiBase: "https://open.tiktokapis.com/v2",
    },
    YOUTUBE: {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube",
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
        ],
        apiBase: "https://www.googleapis.com/youtube/v3",
    },
    PINTEREST: {
        authUrl: "https://www.pinterest.com/oauth/",
        tokenUrl: "https://api.pinterest.com/v5/oauth/token",
        scopes: ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"],
        apiBase: "https://api.pinterest.com/v5",
    },
    GOOGLE_BUSINESS: {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/business.manage"],
        apiBase: "https://mybusinessbusinessinformation.googleapis.com/v1",
    },
    LINKEDIN: {
        authUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scopes: ["openid", "profile", "email", "w_member_social"],
        apiBase: "https://api.linkedin.com",
    },
    BLUESKY: {
        authUrl: "",
        tokenUrl: "",
        scopes: [],
        apiBase: "https://bsky.social/xrpc",
    },
    THREADS: {
        authUrl: "https://www.threads.net/oauth/authorize",
        tokenUrl: "https://graph.threads.net/oauth/access_token",
        scopes: [
            "threads_basic",
            "threads_content_publish",
            "threads_manage_insights",
            "threads_manage_replies",
            "threads_read_replies",
        ],
        apiBase: "https://graph.threads.net/v1.0",
    },
    MANUAL: {
        authUrl: "",
        tokenUrl: "",
        scopes: [],
        apiBase: "",
    },
    META: {
        authUrl: "",
        tokenUrl: "",
        scopes: [],
        apiBase: "",
    },
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