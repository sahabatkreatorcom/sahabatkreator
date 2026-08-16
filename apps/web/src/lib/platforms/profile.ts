import { GRAPH_API_URL, INSTAGRAM_GRAPH_URL, type Platform } from "./config";

export interface OAuthProfile {
    platformId: string;
    name: string;
    username: string;
    profilePicture?: string;
    metadata?: Record<string, unknown>;
}

export async function fetchPlatformProfile(
    platform: Platform,
    accessToken: string,
): Promise<OAuthProfile | null> {
    switch (platform) {
        case "INSTAGRAM":
            return fetchInstagramStandaloneProfile(accessToken);
        case "INSTAGRAM_PAGE":
            return fetchInstagramPageProfile(accessToken);
        case "FACEBOOK":
            return fetchFacebookPageProfile(accessToken);
        case "TIKTOK":
            return fetchTikTokProfile(accessToken);
        case "YOUTUBE":
            return fetchYouTubeChannel(accessToken);
        case "GOOGLE_BUSINESS":
            return fetchGoogleBusinessProfile(accessToken);
        case "PINTEREST":
            return fetchPinterestProfile(accessToken);
        case "LINKEDIN":
            return fetchLinkedInProfile(accessToken);
        case "THREADS":
            return fetchThreadsProfile(accessToken);
        default:
            return null;
    }
}

/** Instagram STANDALONE — Graph API sendiri (graph.instagram.com). */
export async function fetchInstagramStandaloneProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch(
            `${INSTAGRAM_GRAPH_URL}/me?fields=id,username,account_type,profile_picture_url&access_token=${accessToken}`,
        );
        const data = await res.json();
        if (data.error || !data.id) return null;

        return {
            platformId: data.id,
            name: data.username || "Instagram user",
            username: data.username || "",
            profilePicture: data.profile_picture_url,
            metadata: { accountType: data.account_type },
        };
    } catch {
        return null;
    }
}

/** Instagram yang tertaut Facebook Page — via me/accounts (Graph API Meta). */
export async function fetchInstagramPageProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch(
            `${GRAPH_API_URL}/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const data = await res.json();
        if (data.error) return null;

        const page = data.data?.find((p: { instagram_business_account?: unknown }) => p.instagram_business_account);
        if (!page?.instagram_business_account) return null;

        const ig = page.instagram_business_account;
        return {
            platformId: ig.id,
            name: ig.name || page.name,
            username: ig.username || "",
            profilePicture: ig.profile_picture_url,
            metadata: { facebookPageId: page.id, facebookPageName: page.name, pageAccessToken: page.access_token },
        };
    } catch {
        return null;
    }
}

export async function fetchFacebookPageProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch(`${GRAPH_API_URL}/me/accounts?fields=id,name,picture{url},fan_count,access_token`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (data.error) return null;

        const page = data.data?.[0];
        if (!page) return null;

        return {
            platformId: page.id,
            name: page.name,
            username: page.name,
            profilePicture: page.picture?.data?.url,
            metadata: { fanCount: page.fan_count, pageAccessToken: page.access_token },
        };
    } catch {
        return null;
    }
}

export async function fetchTikTokProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        const user = data.data?.user;
        if (!user) return null;
        return {
            platformId: user.open_id,
            name: user.display_name,
            username: user.username,
            profilePicture: user.avatar_url,
        };
    } catch {
        return null;
    }
}

export async function fetchYouTubeChannel(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        const channel = data.items?.[0];
        if (!channel) return null;
        return {
            platformId: channel.id,
            name: channel.snippet.title,
            username: channel.snippet.customUrl ?? "",
            profilePicture: channel.snippet.thumbnails?.default?.url,
        };
    } catch {
        return null;
    }
}

export async function fetchGoogleBusinessProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        const account = data.accounts?.[0];
        if (!account) return null;
        return {
            platformId: account.name,
            name: account.accountName || "Business Account",
            username: account.accountName || "",
        };
    } catch {
        return null;
    }
}

export async function fetchPinterestProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch("https://api.pinterest.com/v5/user_account", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!data.username) return null;
        return {
            platformId: data.username,
            name: data.full_name || data.username,
            username: data.username,
            profilePicture: data.profile_image,
        };
    } catch {
        return null;
    }
}

export async function fetchLinkedInProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!data.sub) return null;
        return {
            platformId: data.sub,
            name: `${data.given_name ?? ""} ${data.family_name ?? ""}`.trim(),
            username: data.preferred_username ?? data.email ?? "",
            profilePicture: data.picture,
        };
    } catch {
        return null;
    }
}

export async function fetchThreadsProfile(accessToken: string): Promise<OAuthProfile | null> {
    try {
        const res = await fetch("https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (data.error || !data.id) return null;
        return {
            platformId: data.id,
            name: data.username || "Threads user",
            username: data.username || "",
            profilePicture: data.threads_profile_picture_url,
        };
    } catch {
        return null;
    }
}