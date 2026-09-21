// Konfigurasi OAuth per platform: endpoint, scope least-privilege, dan opsi flow.

import {
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GRAPH_FB_URL,
  GRAPH_THREADS_OAUTH_URL,
  INSTAGRAM_OAUTH_AUTH_URL,
  INSTAGRAM_OAUTH_TOKEN_URL,
  LINKEDIN_OAUTH_AUTH_URL,
  LINKEDIN_OAUTH_TOKEN_URL,
  META_DIALOG_URL,
  PINTEREST_API_BASE_URL,
  PINTEREST_OAUTH_URL,
  THREADS_OAUTH_AUTH_URL,
  TIKTOK_AUTH_URL,
  TIKTOK_OPEN_API_URL,
} from "../config";
import type { OAuthConfig, OAuthPlatform } from "./types";

/**
 * Scope yang menandakan token punya akses menulis/mengelola organization (company page).
 * Community Management API hanya memberi `rw_organization_admin` (+ r_organization_social /
 * w_organization_social) — `r_organization_admin` tidak termasuk (itu milik Advertising API),
 * jadi gate picker multi-company harus menerima keduanya.
 */
export const LINKEDIN_ORG_ACCESS_SCOPES = ["rw_organization_admin", "r_organization_admin"];

export const OAUTH_CONFIGS: Record<OAuthPlatform, OAuthConfig> = {
  // Instagram via FB Login — Graph API, Page-scoped
  instagram: {
    authorizeUrl: META_DIALOG_URL,
    tokenUrl: `${GRAPH_FB_URL}/oauth/access_token`,
    scopes: [
      "pages_show_list",
      // Page di Business Manager hanya muncul di /me/accounts bila token punya
      // scope ini (terbukti via Graph API Explorer; tanpa ini → data kosong)
      "business_management",
      "pages_manage_metadata", // Instagram Messaging + webhook Page setup
      "pages_messaging", // Instagram Messaging via linked Facebook Page
      "pages_manage_posts",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_comments",
      "instagram_manage_messages",
      "instagram_manage_insights", // media insights utk analytics
    ],
  },
  // Instagram standalone — Business Login for Instagram (IG Login)
  instagram_standalone: {
    authorizeUrl: INSTAGRAM_OAUTH_AUTH_URL,
    tokenUrl: INSTAGRAM_OAUTH_TOKEN_URL,
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
      "instagram_business_manage_insights", // media insights utk analytics
    ],
  },
  facebook: {
    authorizeUrl: META_DIALOG_URL,
    tokenUrl: `${GRAPH_FB_URL}/oauth/access_token`,
    scopes: [
      "pages_show_list",
      // Sama dengan instagram: Page Business Manager butuh scope ini agar
      // terlihat di /me/accounts (picker Page saat connect)
      "business_management",
      "pages_manage_metadata", // webhook + Messenger Platform Page setup
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_manage_engagement", // reply komentar Page
      "pages_messaging", // read/reply Facebook Page conversations
      // Page Insights (page_impressions, page_fans_gender_age, dll). Ini satu-
      // satunya permission yang sah untuk metrik Insights — BUKAN pages_user_gender
      // (permission itu untuk gender *orang* yang chat, dan membatalkan seluruh
      // authorize request dengan "Invalid Scope" bila app tidak punya aksesnya).
      "read_insights",
    ],
  },
  threads: {
    authorizeUrl: THREADS_OAUTH_AUTH_URL,
    tokenUrl: GRAPH_THREADS_OAUTH_URL,
    scopes: [
      "threads_basic",
      "threads_content_publish",
      "threads_manage_replies",
      "threads_read_replies", // baca conversations utk sync inbox
      "threads_manage_insights",
      "threads_share_to_instagram", // cross-post Threads → IG Stories (crossreshare_to_ig)
      // Advanced access (App Review per izin) — lihat threads-advanced.ts + docs threads.md
      "threads_delete", // hapus post dari dashboard (limit 100/24 jam)
      "threads_manage_mentions", // sync mention ke inbox (engagement-sync)
      "threads_keyword_search", // riset keyword (limit 500/7 hari)
      "threads_location_tagging", // search & tag lokasi saat publish (limit 500/24 jam)
      "threads_profile_discovery", // profil & post publik akun lain (riset/competitor)
    ],
  },
  tiktok: {
    authorizeUrl: TIKTOK_AUTH_URL,
    tokenUrl: `${TIKTOK_OPEN_API_URL}/oauth/token/`,
    // TikTok Login Kit v2: param kredensial bernama client_key, bukan client_id
    clientIdParam: "client_key",
    // Scope di authorize dipisah koma (docs Login Kit v2)
    scopeSeparator: ",",
    scopes: [
      "user.info.basic",
      "user.info.profile",
      "user.info.stats",
      "video.upload",
      "video.publish",
      "video.list", // list video utk sync komentar
      // comment.list / comment.list.manage (inbox) — BUKAN scope default:
      // Comment API adalah product terpisah; app belum di-approve menolak authorize
      // dengan error "scope". Tambahkan via TIKTOK_EXTRA_SCOPES setelah approval.
    ],
  },
  // YouTube & GBP share Google OAuth (client sama, scope beda)
  youtube: {
    authorizeUrl: GOOGLE_OAUTH_AUTH_URL,
    tokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.force-ssl", // reply komentar
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    scopeSeparator: " ",
    extraAuthorizeParams: {
      access_type: "offline", // wajib untuk refresh token
      // select_account: paksa account chooser — user bisa memilih akun Google lain
      // saat connect YouTube ke-2 dst. (YouTube API tidak mendukung pilih channel via API;
      // satu koneksi = satu channel — multi-channel = connect ulang dengan akun Google beda)
      prompt: "select_account consent",
      include_granted_scopes: "true",
    },
  },
  google_business: {
    authorizeUrl: GOOGLE_OAUTH_AUTH_URL,
    tokenUrl: GOOGLE_OAUTH_TOKEN_URL,
    scopes: [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    scopeSeparator: " ",
    extraAuthorizeParams: {
      access_type: "offline",
      // select_account: akun pengelola GBP sering beda dengan akun YouTube —
      // paksa account chooser (pola sama dengan youtube, lihat komentar di atas)
      prompt: "select_account consent",
    },
  },
  pinterest: {
    authorizeUrl: PINTEREST_OAUTH_URL,
    // Sandbox: exchange/refresh token lewat host api-sandbox (docs Developer tools → Sandbox,
    // "insert -sandbox in the URL request path"); authorize tetap pinterest.com
    tokenUrl: `${PINTEREST_API_BASE_URL}/oauth/token`,
    scopes: ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"],
    scopeSeparator: ",",
    basicAuth: true,
  },
  linkedin: {
    authorizeUrl: LINKEDIN_OAUTH_AUTH_URL,
    tokenUrl: LINKEDIN_OAUTH_TOKEN_URL,
    scopes: ["openid", "profile", "email", "w_member_social"],
    scopeSeparator: " ",
  },
  // Community Management API (app LinkedIn KEDUA, terpisah dari app personal).
  // Product ini hanya tersedia self-serve bila jadi SATU-SATUNYA product di app-nya
  // → app tanpa `openid`: tidak ada /v2/userinfo, entitas = halaman company dari
  // organizationAcls. Scope = 3 grup resmi (Posts API pakai r_/w_organization_social,
  // Social Metadata & komentar pakai r_/w_organization_social_feed).
  linkedin_org: {
    authorizeUrl: LINKEDIN_OAUTH_AUTH_URL,
    tokenUrl: LINKEDIN_OAUTH_TOKEN_URL,
    scopes: [
      "rw_organization_admin", // /rest/organizationAcls + Organization Lookup
      "r_organization_social", // /rest/posts — baca post organization
      "w_organization_social", // /rest/posts — publish post organization
      "r_organization_social_feed", // /rest/socialActions — baca komentar
      "w_organization_social_feed", // /rest/socialActions — balas komentar
    ],
    scopeSeparator: " ",
  },
  // Bluesky: atproto OAuth (PKCE + PAR + DPoP) kompleks — fase 1 pakai app password.
  // OAuth flow penuh menyusul (butuh client metadata document + DPoP nonce management).
  bluesky: {
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
  // Shopee: authorize URL dibangun Repliz (open.shopee.com), bukan app kita.
  // Config di sini hanya agar Record<OAuthPlatform, OAuthConfig> lengkap;
  // routing connect dilakukan route oauth/start via isReplizRouted().
  shopee: {
    authorizeUrl: "",
    tokenUrl: "",
    scopes: [],
  },
};

/** Platform dengan OAuth redirect flow aktif (bluesky belum — app password) */
export function isOAuthPlatformSupported(platform: string): platform is OAuthPlatform {
  if (platform === "bluesky") return false;
  return platform in OAUTH_CONFIGS;
}
