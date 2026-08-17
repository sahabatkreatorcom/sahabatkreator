import { INSTAGRAM_GRAPH_URL, GRAPH_API_URL } from "@/lib/platforms";

export interface AccountMetrics {
    followers: number;
    followersChange: number;
    following: number;
    impressions: number;
    reach: number;
    engagementRate: number;
    profileViews: number;
    websiteClicks: number;
    emailClicks: number;
    platformMetrics?: Record<string, unknown>;
}

export interface PostMetrics {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews: number | null;
    engagementRate: number;
    platformMetrics?: Record<string, unknown>;
}

/**
 * Fetch metrik akun dari platform. Kembalikan null bila gagal / belum didukung.
 */
export async function fetchAccountMetrics(
    platform: string,
    accessToken: string,
): Promise<AccountMetrics | null> {
    switch (platform) {
        case "INSTAGRAM":
        case "INSTAGRAM_PAGE":
            return fetchInstagramMetrics(accessToken);
        case "FACEBOOK":
            return fetchFacebookMetrics(accessToken);
        case "TIKTOK":
            return fetchTikTokMetrics(accessToken);
        case "YOUTUBE":
            return fetchYouTubeMetrics(accessToken);
        case "THREADS":
            return fetchThreadsMetrics(accessToken);
        case "LINKEDIN":
            return fetchLinkedInMetrics(accessToken);
        default:
            return null;
    }
}

async function fetchInstagramMetrics(accessToken: string): Promise<AccountMetrics | null> {
    try {
        const res = await fetch(`${INSTAGRAM_GRAPH_URL}/me?fields=id,username,media_count,followers_count,follows_count,media{like_count,comments_count}&access_token=${accessToken}`);
        const data = await res.json();
        if (data.error || !data.id) return null;

        const followers = data.followers_count || 0;
        let likes = 0;
        let comments = 0;
        let impressions = 0;
        for (const m of data.media?.data ?? []) {
            likes += m.like_count || 0;
            comments += m.comments_count || 0;
        }

        return {
            followers,
            followersChange: 0,
            following: data.follows_count || 0,
            impressions,
            reach: 0,
            engagementRate: followers > 0 ? Math.round(((likes + comments) / followers) * 100) : 0,
            profileViews: 0,
            websiteClicks: 0,
            emailClicks: 0,
            platformMetrics: { media_count: data.media_count },
        };
    } catch {
        return null;
    }
}

async function fetchFacebookMetrics(accessToken: string): Promise<AccountMetrics | null> {
    try {
        const res = await fetch(`${GRAPH_API_URL}/me?fields=id,followers_count,new_like_count&access_token=${accessToken}`);
        const data = await res.json();
        if (data.error || !data.id) return null;
        return {
            followers: data.followers_count || 0,
            followersChange: data.new_like_count || 0,
            following: 0,
            impressions: 0,
            reach: 0,
            engagementRate: 0,
            profileViews: 0,
            websiteClicks: 0,
            emailClicks: 0,
        };
    } catch {
        return null;
    }
}

async function fetchTikTokMetrics(accessToken: string): Promise<AccountMetrics | null> {
    try {
        const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count,likes_count,video_count", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        const user = data.data?.user;
        if (!user) return null;
        return {
            followers: user.follower_count || 0,
            followersChange: 0,
            following: user.following_count || 0,
            impressions: 0,
            reach: 0,
            engagementRate: 0,
            profileViews: 0,
            websiteClicks: 0,
            emailClicks: 0,
            platformMetrics: { likes_count: user.likes_count, video_count: user.video_count },
        };
    } catch {
        return null;
    }
}

async function fetchYouTubeMetrics(accessToken: string): Promise<AccountMetrics | null> {
    try {
        const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const stats = res.ok ? (await res.json()).items?.[0]?.statistics : null;
        if (!stats) return null;
        return {
            followers: parseInt(stats.subscriberCount, 10) || 0,
            followersChange: 0,
            following: 0,
            impressions: parseInt(stats.viewCount, 10) || 0,
            reach: 0,
            engagementRate: 0,
            profileViews: parseInt(stats.viewCount, 10) || 0,
            websiteClicks: 0,
            emailClicks: 0,
            platformMetrics: { video_count: parseInt(stats.videoCount, 10) || 0 },
        };
    } catch {
        return null;
    }
}

async function fetchThreadsMetrics(accessToken: string): Promise<AccountMetrics | null> {
    try {
        const res = await fetch("https://graph.threads.net/v1.0/me?fields=id,username,followers_count,following_count,threads_media_count", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (data.error || !data.id) return null;
        return {
            followers: data.followers_count || 0,
            followersChange: 0,
            following: data.following_count || 0,
            impressions: 0,
            reach: 0,
            engagementRate: 0,
            profileViews: 0,
            websiteClicks: 0,
            emailClicks: 0,
            platformMetrics: { threads_media_count: data.threads_media_count },
        };
    } catch {
        return null;
    }
}

async function fetchLinkedInMetrics(accessToken: string): Promise<AccountMetrics | null> {
    try {
        const res = await fetch("https://api.linkedin.com/rest/networkSizes/urn:li:organization:me?counts=Total", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "X-Restli-Protocol-Version": "2.0.0",
                "LinkedIn-Version": "202603",
            },
        });
        const data = await res.json();
        if (data.error || !data.firstDegreeSize) return null;
        return {
            followers: data.firstDegreeSize.total || 0,
            followersChange: 0,
            following: 0,
            impressions: 0,
            reach: 0,
            engagementRate: 0,
            profileViews: 0,
            websiteClicks: 0,
            emailClicks: 0,
        };
    } catch {
        return null;
    }
}

export const emptyPostMetrics = (): PostMetrics => ({
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    videoViews: null,
    engagementRate: 0,
});