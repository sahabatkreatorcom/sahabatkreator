import { PLATFORM_OAUTH_CONFIGS, type Platform } from "./config";

export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    refreshTokenExpiresIn?: number;
}

export function getAuthorizationUrl(
    platform: Platform,
    redirectUri: string,
    state: string,
    credentials?: { clientId: string; clientSecret: string },
): string {
    const config = PLATFORM_OAUTH_CONFIGS[platform];
    const clientId = credentials?.clientId || process.env[`${platform}_CLIENT_ID`] || "";
    const clientIdParam = platform === "TIKTOK" ? "client_key" : "client_id";
    const scopeSeparator = platform === "TIKTOK" || platform === "THREADS" ? "," : " ";

    const params = new URLSearchParams({
        [clientIdParam]: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(scopeSeparator),
        state,
    });

    if (platform === "YOUTUBE" || platform === "GOOGLE_BUSINESS") {
        params.set("access_type", "offline");
        params.set("prompt", "consent");
    }

    return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
    platform: Platform,
    code: string,
    redirectUri: string,
    credentials?: { clientId: string; clientSecret: string },
): Promise<TokenResponse> {
    const clientId = credentials?.clientId || process.env[`${platform}_CLIENT_ID`] || "";
    const clientSecret = credentials?.clientSecret || process.env[`${platform}_CLIENT_SECRET`] || "";
    if (!clientId || !clientSecret) {
        throw new Error(`Kredensial OAuth untuk ${platform} belum dikonfigurasi.`);
    }

    switch (platform) {
        case "INSTAGRAM":
        case "FACEBOOK":
            return exchangeFacebookToken(code, redirectUri, clientId, clientSecret);
        case "THREADS":
            return exchangeThreadsToken(code, redirectUri, clientId, clientSecret);
        case "TIKTOK":
            return exchangeTikTokToken(code, redirectUri, clientId, clientSecret);
        case "YOUTUBE":
        case "GOOGLE_BUSINESS":
            return exchangeGoogleToken(code, redirectUri, clientId, clientSecret);
        case "PINTEREST":
            return exchangePinterestToken(code, redirectUri, clientId, clientSecret);
        case "LINKEDIN":
            return exchangeLinkedInToken(code, redirectUri, clientId, clientSecret);
        default:
            throw new Error(`Platform ${platform} tidak mendukung OAuth code exchange.`);
    }
}

export async function refreshAccessToken(
    platform: Platform,
    refreshToken: string,
    credentials?: { clientId: string; clientSecret: string },
): Promise<TokenResponse> {
    const clientId = credentials?.clientId || process.env[`${platform}_CLIENT_ID`] || "";
    const clientSecret = credentials?.clientSecret || process.env[`${platform}_CLIENT_SECRET`] || "";

    switch (platform) {
        case "INSTAGRAM":
            return refreshMetaLongLivedToken(refreshToken, "ig_refresh_token");
        case "THREADS":
            return refreshMetaLongLivedToken(refreshToken, "th_refresh_token");
        case "FACEBOOK":
            return refreshFacebookToken(refreshToken, clientId, clientSecret);
        case "TIKTOK":
            return refreshTikTokToken(refreshToken, clientId, clientSecret);
        case "YOUTUBE":
        case "GOOGLE_BUSINESS":
            return refreshGoogleToken(refreshToken, clientId, clientSecret);
        case "PINTEREST":
            return refreshPinterestToken(refreshToken, clientId, clientSecret);
        case "LINKEDIN":
            return refreshLinkedInToken(refreshToken, clientId, clientSecret);
        default:
            throw new Error(`Platform ${platform} tidak mendukung refresh token.`);
    }
}

// ─── Facebook / Instagram (Meta) ────────────────────────────────────────────

async function exchangeFacebookToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const url = `${PLATFORM_OAUTH_CONFIGS.FACEBOOK.tokenUrl}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "Gagal tukar kode Meta.");

    const longRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: clientId,
            client_secret: clientSecret,
            fb_exchange_token: data.access_token,
        }),
    });
    const longData = await longRes.json();

    return {
        accessToken: longData.access_token || data.access_token,
        expiresIn: longData.expires_in || data.expires_in || 5184000,
    };
}

async function refreshFacebookToken(
    accessToken: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch(`${PLATFORM_OAUTH_CONFIGS.FACEBOOK.tokenUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: clientId,
            client_secret: clientSecret,
            fb_exchange_token: accessToken,
        }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "Gagal refresh token Meta.");
    return { accessToken: data.access_token, expiresIn: data.expires_in || 5184000 };
}

async function refreshMetaLongLivedToken(accessToken: string, grantType: string): Promise<TokenResponse> {
    const base = grantType === "th_refresh_token" ? "https://graph.threads.net" : "https://graph.instagram.com";
    const res = await fetch(`${base}/refresh_access_token?grant_type=${grantType}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "Gagal refresh token.");
    return { accessToken: data.access_token, expiresIn: data.expires_in || 5184000 };
}

// ─── Threads ─────────────────────────────────────────────────────────────────

async function exchangeThreadsToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://graph.threads.net/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "Gagal tukar kode Threads.");

    const longRes = await fetch("https://graph.threads.net/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "th_exchange_token", client_secret: clientSecret, access_token: data.access_token }),
    });
    const longData = await longRes.json();
    if (longData.error) return { accessToken: data.access_token, expiresIn: 3600 };
    return { accessToken: longData.access_token, expiresIn: longData.expires_in || 5184000 };
}

// ─── TikTok ──────────────────────────────────────────────────────────────────

async function exchangeTikTokToken(
    code: string,
    redirectUri: string,
    clientKey: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    const data = await res.json();
    if (!res.ok || (data.error && data.error !== "ok")) throw new Error(data.error_description || "Gagal tukar kode TikTok.");
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400,
        refreshTokenExpiresIn: data.refresh_expires_in || 31536000,
    };
}

async function refreshTikTokToken(
    refreshToken: string,
    clientKey: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok || (data.error && data.error !== "ok")) throw new Error(data.error_description || "Gagal refresh TikTok.");
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 86400,
        refreshTokenExpiresIn: data.refresh_expires_in,
    };
}

// ─── Google (YouTube / Google Business) ──────────────────────────────────────

async function exchangeGoogleToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || "Gagal tukar kode Google.");
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in || 3600 };
}

async function refreshGoogleToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || "Gagal refresh Google.");
    return { accessToken: data.access_token, refreshToken, expiresIn: data.expires_in || 3600 };
}

// ─── Pinterest ───────────────────────────────────────────────────────────────

async function exchangePinterestToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    const data = await res.json();
    if (!res.ok || data.code || data.error) throw new Error(data.message || "Gagal tukar kode Pinterest.");
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 2592000,
        refreshTokenExpiresIn: data.refresh_token_expires_in || 31536000,
    };
}

async function refreshPinterestToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const data = await res.json();
    if (!res.ok || data.code || data.error) throw new Error(data.message || "Gagal refresh Pinterest.");
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 2592000,
        refreshTokenExpiresIn: data.refresh_token_expires_in || 31536000,
    };
}

// ─── LinkedIn ────────────────────────────────────────────────────────────────

async function exchangeLinkedInToken(
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || "Gagal tukar kode LinkedIn.");
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in || 5184000 };
}

async function refreshLinkedInToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
): Promise<TokenResponse> {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || "Gagal refresh LinkedIn.");
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in || 5184000 };
}