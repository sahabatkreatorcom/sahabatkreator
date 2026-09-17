// Konfigurasi terpusat package publishing — single source of truth.
// Nilai berasal dari @sahabatkreator/env/server (root .env); fallback default
// identik untuk path yang berjalan tanpa env ter-load (mis. test).
//
// Semua host/endpoint API platform HARUS didefinisikan di sini. Jangan hardcode
// URL platform di adapter/module lain — import dari file ini.
import { env } from "@sahabatkreator/env/server";

/** Versi Graph API Meta (pin di env; riset docs/social-platforms/meta-facebook.md) */
export const META_GRAPH_VERSION = env.META_GRAPH_VERSION || "v26.0";

/** Versi API LinkedIn — sunset bulanan, update rutin via env */
export const LINKEDIN_API_VERSION = env.LINKEDIN_API_VERSION || "202608";

/** Host PDS Bluesky default */
export const BLUESKY_PDS_URL = env.BLUESKY_PDS_URL || "https://bsky.social";

/**
 * Base URL API Pinterest v5 — set ke https://api-sandbox.pinterest.com/v5 untuk
 * uji di Sandbox (docs/developer-tools/sandbox).
 */
export const PINTEREST_API_BASE_URL = env.PINTEREST_API_BASE_URL || "https://api.pinterest.com/v5";

/** Mode sandbox aktif? (base URL diarahkan ke api-sandbox.pinterest.com) */
export const PINTEREST_SANDBOX = PINTEREST_API_BASE_URL.includes("api-sandbox.pinterest.com");

// ---------------------------------------------------------------------------
// Endpoint API platform — single source of truth (semua module import dari sini)
// ---------------------------------------------------------------------------

/** Graph API Facebook (versi terpusat) */
export const GRAPH_FB_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
/** Graph API Instagram standalone (Instagram API with Instagram Login) */
export const GRAPH_IG_URL = `https://graph.instagram.com/${META_GRAPH_VERSION}`;
/** Graph API Threads */
export const GRAPH_THREADS_URL = "https://graph.threads.net/v1.0";
/** OAuth Threads (authorize di threads.net, token exchange & revoke di Graph API) */
export const THREADS_OAUTH_AUTH_URL = "https://threads.net/oauth/authorize";
export const GRAPH_THREADS_OAUTH_URL = "https://graph.threads.net/oauth/access_token";
/** Upgrade short-lived → long-lived 60 hari (GET, grant_type=th_exchange_token) */
export const GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL = "https://graph.threads.net/access_token";
/** Refresh long-lived token (GET, grant_type=th_refresh_token) */
export const GRAPH_THREADS_REFRESH_URL = "https://graph.threads.net/refresh_access_token";
export const GRAPH_THREADS_REVOKE_URL = "https://graph.threads.net/revoke";
/** Dialog login Facebook (authorize Meta app) */
export const META_DIALOG_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
/** OAuth Instagram standalone — Business Login for Instagram (IG Login) */
export const INSTAGRAM_OAUTH_AUTH_URL = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
/** Upgrade short-lived → long-lived 60 hari (GET, grant_type=ig_exchange_token) */
export const GRAPH_IG_EXCHANGE_LONG_LIVED_URL = `https://graph.instagram.com/${META_GRAPH_VERSION}/access_token`;
/** Refresh long-lived token IG Login (GET, grant_type=ig_refresh_token) */
export const GRAPH_IG_REFRESH_URL = `https://graph.instagram.com/${META_GRAPH_VERSION}/refresh_access_token`;
/** Open API TikTok (Login Kit + Content Posting API) */
export const TIKTOK_OPEN_API_URL = "https://open.tiktokapis.com/v2";
/** Authorize TikTok (login screen) — token exchange & revoke pakai TIKTOK_OPEN_API_URL */
export const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
/** Content Posting API TikTok (video/init, content/init, status/fetch) */
export const TIKTOK_PUBLISH_URL = `${TIKTOK_OPEN_API_URL}/post/publish`;
/** REST API LinkedIn (dipakai adapter + engagement sync) */
export const LINKEDIN_REST_URL = "https://api.linkedin.com";
/** OAuth LinkedIn v2 (authorize + accessToken) */
export const LINKEDIN_OAUTH_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_OAUTH_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_OAUTH_REVOKE_URL = "https://www.linkedin.com/oauth/v2/revoke";
/** OpenID Connect userinfo LinkedIn (profil saat connect) */
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
/** OAuth Google (YouTube, Google Business Profile) */
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Google Business Profile API (localPosts + review reply) */
export const GBP_API_URL = "https://mybusiness.googleapis.com";
/** GBP Account Management API (list accounts saat connect) */
export const GBP_ACCOUNT_API_URL = "https://mybusinessaccountmanagement.googleapis.com/v1";
/** OAuth Pinterest (authorize tetap pinterest.com walau API diarahkan ke sandbox) */
export const PINTEREST_OAUTH_URL = "https://www.pinterest.com/oauth/";
/** Public App View Bluesky (analytics/engagement, tanpa auth) */
export const BSKY_APPVIEW_URL = "https://public.api.bsky.app";
/** YouTube Data API v3 (first comment + analytics) */
export const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
