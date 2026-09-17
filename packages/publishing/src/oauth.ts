// OAuth 2.0 connect flow per platform — authorize URL, token exchange, profil user
// Riset: docs/social-platforms/{README,app-review-playbook,per-platform}.md (Sep 2026)
//
// Desain:
// - Kredensial app (client_id/secret) dari tabel platform_credential (fallback env)
// - State CSRF disimpan server-side (tabel oauth_state, TTL 10 menit, sekali pakai)
// - Redirect URI: {SERVER_URL}/api/oauth/{platform}/callback

import {
  GBP_ACCOUNT_API_URL,
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL,
  GRAPH_THREADS_OAUTH_URL,
  GRAPH_THREADS_REFRESH_URL,
  GRAPH_THREADS_URL,
  INSTAGRAM_OAUTH_AUTH_URL,
  INSTAGRAM_OAUTH_TOKEN_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_OAUTH_AUTH_URL,
  LINKEDIN_OAUTH_TOKEN_URL,
  LINKEDIN_REST_URL,
  LINKEDIN_USERINFO_URL,
  META_DIALOG_URL,
  PINTEREST_API_BASE_URL,
  PINTEREST_OAUTH_URL,
  PINTEREST_SANDBOX,
  THREADS_OAUTH_AUTH_URL,
  TIKTOK_AUTH_URL,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "./config";
import { httpRequest } from "./http";
import { PublishError } from "./types";

export type OAuthPlatform =
  | "instagram"
  | "instagram_standalone"
  | "facebook"
  | "threads"
  | "tiktok"
  | "youtube"
  | "pinterest"
  | "linkedin"
  // App LinkedIn terpisah (Community Management API) — hanya halaman company
  | "linkedin_org"
  | "google_business"
  | "bluesky";

/** Kredensial app (dari platform_credential atau env fallback) */
export type AppCredential = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Config tambahan (mis. Threads app id) */
  extra?: Record<string, string>;
};

/** Hasil exchange token */
export type TokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date | null;
  scopes: string[];
};

/** Profil user hasil connect (untuk upsert social_account) */
export type PlatformProfile = {
  platformAccountId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Metadata tambahan (mis. daftar page FB, board Pinterest) */
  extra?: Record<string, unknown>;
};

/** Definisi OAuth per platform (authorize endpoint, scope least-privilege dari playbook) */
type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Separator scope di query (default spasi) */
  scopeSeparator?: string;
  /** Token exchange pakai HTTP Basic auth (Pinterest) */
  basicAuth?: boolean;
  /** Param tambahan untuk authorize URL */
  extraAuthorizeParams?: Record<string, string>;
  /**
   * Nama param client id — TikTok Login Kit v2 memakai "client_key"
   * (di authorize, token exchange, dan refresh), bukan "client_id".
   */
  clientIdParam?: "client_id" | "client_key";
};

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
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_manage_engagement", // reply komentar Page
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
};

/** Platform dengan OAuth redirect flow aktif (bluesky belum — app password) */
export function isOAuthPlatformSupported(platform: string): platform is OAuthPlatform {
  if (platform === "bluesky") return false;
  return platform in OAUTH_CONFIGS;
}

/**
 * Scope ekstra dari kredensial app (cred.extra.extraScopes, dipisah spasi/koma).
 * Dipakai LinkedIn: scope organization ditambahkan admin SETELAH product LinkedIn
 * ter-approve (lihat env LINKEDIN_EXTRA_SCOPES) — default kosong agar consent tidak ditolak.
 */
function parseExtraScopes(cred: AppCredential): string[] {
  const raw = cred.extra?.extraScopes;
  return typeof raw === "string" ? raw.split(/[\s,]+/).filter(Boolean) : [];
}

/** Daftar scope lengkap yang diminta (config + extra, tanpa duplikat, urut stabil) */
function requestedScopes(platform: OAuthPlatform, cred: AppCredential): string[] {
  return [...new Set([...OAUTH_CONFIGS[platform].scopes, ...parseExtraScopes(cred)])];
}

/** Scope yang benar-benar di-grant platform (response token field "scope") — fallback ke requested */
function parseGrantedScopes(data: Record<string, any>): string[] | undefined {
  const raw = typeof data.scope === "string" ? data.scope.trim() : "";
  if (!raw) return undefined;
  const granted = raw.split(/[\s,]+/).filter(Boolean);
  return granted.length > 0 ? granted : undefined;
}

/** Bangun URL authorize lengkap dengan state CSRF */
export function buildAuthorizeUrl(
  platform: OAuthPlatform,
  cred: AppCredential,
  state: string,
): string {
  const config = OAUTH_CONFIGS[platform];
  if (!config?.authorizeUrl) {
    throw new PublishError(
      "oauth_not_supported",
      `OAuth redirect ${platform} tidak didukung.`,
      false,
    );
  }
  const sep = config.scopeSeparator ?? " ";
  const params = new URLSearchParams({
    [config.clientIdParam ?? "client_id"]: cred.clientId,
    redirect_uri: cred.redirectUri,
    response_type: "code",
    scope: requestedScopes(platform, cred).join(sep),
    state,
    ...(config.extraAuthorizeParams ?? {}),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

/** Exchange authorization code → token */
export async function exchangeCodeForToken(
  platform: OAuthPlatform,
  cred: AppCredential,
  code: string,
): Promise<TokenResult> {
  const config = OAUTH_CONFIGS[platform];
  if (!config) {
    throw new PublishError("oauth_not_supported", `OAuth ${platform} tidak didukung.`, false);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cred.redirectUri,
    [config.clientIdParam ?? "client_id"]: cred.clientId,
    client_secret: cred.clientSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.basicAuth) {
    // Pinterest: HTTP Basic client_id:client_secret
    headers.Authorization = `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64")}`;
  }

  const res = await httpRequest<Record<string, any>>(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PublishError(
      "oauth_token_exchange_failed",
      `Exchange token ${platform} gagal (${res.status}): ${text.slice(0, 300)}`,
      false,
    );
  }

  const data = await res.json();
  let accessToken: string | undefined = data.access_token ?? data.data?.access_token; // TikTok: { data: { access_token } }
  if (!accessToken) {
    throw new PublishError(
      "oauth_no_token",
      `Response token ${platform} tidak berisi access_token`,
      false,
    );
  }

  let expiresIn = Number(data.expires_in ?? data.data?.expires_in);

  // Threads: token exchange awal hanya short-lived (~24 jam) — langsung upgrade
  // ke long-lived 60 hari via grant_type=th_exchange_token (docs threads.md).
  // Tanpa ini token mati dalam sehari dan refresh scheduler tidak sempat jalan.
  if (platform === "threads") {
    const longLived = await httpRequest<{ access_token?: string; expires_in?: number }>(
      GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL,
      {
        query: {
          grant_type: "th_exchange_token",
          client_secret: cred.clientSecret,
          access_token: accessToken,
        },
      },
    );
    if (longLived.ok) {
      const ld = await longLived.json();
      if (ld.access_token) {
        accessToken = ld.access_token;
        if (ld.expires_in) expiresIn = ld.expires_in; // ~5184000 (60 hari)
      }
    }
    // Gagal upgrade (mis. token private-profile) → lanjut dengan short-lived;
    // refresh scheduler akan coba lagi dan menandai needsReconnect bila gagal.
  }

  return {
    accessToken,
    // Threads: token long-lived juga dipakai untuk refresh berikutnya
    // (th_refresh_token) — simpan sebagai refreshToken supaya scheduler jalan.
    refreshToken:
      platform === "threads"
        ? accessToken
        : (data.refresh_token ?? data.data?.refresh_token ?? undefined),
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    // Pakai scope yang di-grant platform bila tersedia (LinkedIn mengirim field "scope";
    // dipakai fetchProfile untuk deteksi scope organization) — fallback ke yang diminta
    scopes: parseGrantedScopes(data) ?? requestedScopes(platform, cred),
  };
}

/** Refresh token (AT habis — Instagram/Threads, TikTok, Pinterest, Google, LinkedIn) */
export async function refreshAccessToken(
  platform: OAuthPlatform,
  cred: AppCredential,
  refreshToken: string,
): Promise<TokenResult> {
  const config = OAUTH_CONFIGS[platform];
  if (!config?.tokenUrl) {
    throw new PublishError("oauth_not_supported", `OAuth ${platform} tidak didukung.`, false);
  }

  // Threads: flow non-standar — refresh long-lived via GET refresh_access_token
  // dengan grant_type=th_refresh_token & param access_token (docs threads.md).
  // Token long-lived Threads TIDAK menghasilkan refresh_token terpisah.
  if (platform === "threads") {
    const res = await httpRequest<{ access_token?: string; expires_in?: number }>(
      GRAPH_THREADS_REFRESH_URL,
      {
        query: {
          grant_type: "th_refresh_token",
          access_token: refreshToken,
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PublishError(
        "oauth_refresh_failed",
        `Refresh token ${platform} gagal (${res.status}): ${text.slice(0, 200)} — hubungkan ulang akun.`,
        false,
      );
    }
    const data = await res.json();
    if (!data.access_token) {
      throw new PublishError(
        "oauth_no_token",
        `Refresh ${platform} tidak berisi access_token`,
        false,
      );
    }
    const expiresIn = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      // Token hasil refresh = AT sekaligus "refresh token" berikutnya
      refreshToken: data.access_token,
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
      scopes: requestedScopes(platform, cred),
    };
  }

  // Instagram Login: refresh long-lived user token via graph.instagram.com.
  // The token endpoint used for authorization-code exchange does not accept
  // the generic OAuth refresh_token POST flow.
  if (platform === "instagram_standalone") {
    const res = await httpRequest<{ access_token?: string; expires_in?: number }>(
      `${GRAPH_IG_URL}/refresh_access_token`,
      {
        query: {
          grant_type: "ig_refresh_token",
          access_token: refreshToken,
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PublishError(
        "oauth_refresh_failed",
        `Refresh token ${platform} gagal (${res.status}): ${text.slice(0, 200)} — hubungkan ulang akun.`,
        false,
      );
    }
    const data = await res.json();
    if (!data.access_token) {
      throw new PublishError(
        "oauth_no_token",
        `Refresh ${platform} tidak berisi access_token`,
        false,
      );
    }
    const expiresIn = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      // Instagram refresh keeps the same long-lived token family.
      refreshToken,
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
      scopes: requestedScopes(platform, cred),
    };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    [config.clientIdParam ?? "client_id"]: cred.clientId,
    client_secret: cred.clientSecret,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64")}`;
  }

  const res = await httpRequest<Record<string, any>>(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PublishError(
      "oauth_refresh_failed",
      `Refresh token ${platform} gagal (${res.status}): ${text.slice(0, 200)} — hubungkan ulang akun.`,
      false,
    );
  }

  const data = await res.json();
  const accessToken: string | undefined = data.access_token ?? data.data?.access_token;
  if (!accessToken) {
    throw new PublishError(
      "oauth_no_token",
      `Refresh ${platform} tidak berisi access_token`,
      false,
    );
  }
  const expiresIn = Number(data.expires_in ?? data.data?.expires_in);
  return {
    accessToken,
    // Pinterest RT rotating — RT baru harus dipersist; platform lain RT lama tetap valid
    refreshToken: data.refresh_token ?? data.data?.refresh_token ?? refreshToken,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: parseGrantedScopes(data) ?? requestedScopes(platform, cred),
  };
}

// ---------------------------------------------------------------------------
// Profil fetch per platform — untuk upsert social_account
// ---------------------------------------------------------------------------

/**
 * Identitas user access token Meta — untuk pesan error saat /me/accounts kosong.
 * Best-effort: gagal fetch → string kosong (jangan gagalkan error utama).
 */
async function metaWhoAmI(accessToken: string): Promise<string> {
  try {
    const meRes = await httpRequest<{ name?: string; email?: string }>(`${GRAPH_FB_URL}/me`, {
      query: { access_token: accessToken, fields: "name,email" },
    });
    if (!meRes.ok) return "";
    const me = await meRes.json();
    if (!me.name) return "";
    return ` (login sebagai "${me.name}"${me.email ? ` / ${me.email}` : ""})`;
  } catch {
    return "";
  }
}

export async function fetchPlatformProfile(
  platform: OAuthPlatform,
  token: TokenResult,
): Promise<PlatformProfile> {
  const at = token.accessToken;
  switch (platform) {
    case "instagram": {
      // FB Login: /me/accounts → page; pilih page dengan IG business account
      const res = await httpRequest<{
        data?: Array<{
          id: string;
          name: string;
          access_token: string;
          picture?: { data?: { url?: string } };
          instagram_business_account?: {
            id: string;
            username?: string;
            profile_picture_url?: string;
          };
        }>;
      }>(`${GRAPH_FB_URL}/me/accounts`, {
        query: {
          access_token: at,
          fields:
            "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
        },
      });
      if (!res.ok)
        throw new PublishError(
          "oauth_profile_failed",
          "Gagal mengambil daftar Page Facebook",
          false,
        );
      const pages = (await res.json()).data ?? [];
      if (pages.length === 0) {
        throw new PublishError(
          "oauth_no_page",
          `Akun Facebook ini tidak mengelola Page apa pun${await metaWhoAmI(at)}. Pastikan akun yang dipilih saat login benar (cek facebook.com/pages), dan untuk aplikasi mode development, hanya pengguna dengan role di aplikasi yang Page-nya terlihat.`,
          false,
        );
      }
      const page = pages.find((p) => p.instagram_business_account);
      if (!page) {
        throw new PublishError(
          "oauth_no_ig_account",
          "Tidak ada Page Facebook dengan Instagram Business terhubung. Hubungkan akun IG (Business/Creator) ke Page dulu di pengaturan Instagram → Linked accounts.",
          false,
        );
      }
      const igba = page.instagram_business_account!;
      // Page access token: lebih tahan lama, scope page penuh
      return {
        platformAccountId: igba.id,
        username: igba.username ?? page.name,
        displayName: page.name,
        avatarUrl: igba.profile_picture_url ?? page.picture?.data?.url ?? null,
        extra: {
          pageId: page.id,
          pageAccessToken: page.access_token,
          // access_token + instagram_business_account WAJIB ikut — dipakai
          // buildPendingPages (multi-Page) utk enkripsi page token per Page
          pages: pages.map((p) => ({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
            picture: p.picture,
            instagram_business_account: p.instagram_business_account,
          })),
        },
      };
    }

    case "instagram_standalone": {
      const res = await httpRequest<{
        id?: string;
        username?: string;
        account_type?: string;
        profile_picture_url?: string;
      }>(`${GRAPH_IG_URL}/me`, {
        query: { fields: "id,username,account_type,profile_picture_url", access_token: at },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil Instagram", false);
      const me = await res.json();
      if (!me.id)
        throw new PublishError("oauth_no_profile", "Profil IG tidak mengembalikan ID", false);
      return {
        platformAccountId: me.id,
        username: me.username ?? me.id,
        avatarUrl: me.profile_picture_url ?? null,
      };
    }

    case "facebook": {
      const res = await httpRequest<{
        data?: Array<{
          id: string;
          name: string;
          access_token: string;
          picture?: { data?: { url?: string } };
        }>;
      }>(`${GRAPH_FB_URL}/me/accounts`, {
        query: { access_token: at, fields: "id,name,access_token,picture{url}" },
      });
      if (!res.ok)
        throw new PublishError(
          "oauth_profile_failed",
          "Gagal mengambil daftar Page Facebook",
          false,
        );
      const pages = (await res.json()).data ?? [];
      if (pages.length === 0) {
        // Penyebab terumum /me/accounts kosong: salah pilih akun di account
        // chooser, atau Page tak terlihat app di mode development.
        throw new PublishError(
          "oauth_no_page",
          `Tidak ada Page Facebook yang dikelola akun ini${await metaWhoAmI(at)}. Pastikan akun yang dipilih saat login memiliki role di Page (cek facebook.com/pages), dan di aplikasi mode development, hanya pengguna dengan role di aplikasi yang Page-nya terlihat.`,
          false,
        );
      }
      const page = pages[0]!;
      return {
        platformAccountId: page.id,
        username: page.name,
        displayName: page.name,
        avatarUrl: page.picture?.data?.url ?? null,
        extra: {
          pageAccessToken: page.access_token,
          // access_token WAJIB ikut — dipakai buildPendingPages (multi-Page)
          pages: pages.map((p) => ({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
            picture: p.picture,
          })),
        },
      };
    }

    case "threads": {
      const res = await httpRequest<{
        id?: string;
        username?: string;
        threads_profile_picture_url?: string;
      }>(`${GRAPH_THREADS_URL}/me`, {
        query: { fields: "id,username,threads_profile_picture_url", access_token: at },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil Threads", false);
      const me = await res.json();
      if (!me.id)
        throw new PublishError("oauth_no_profile", "Profil Threads tidak mengembalikan ID", false);
      return {
        platformAccountId: me.id,
        username: me.username ?? me.id,
        avatarUrl: me.threads_profile_picture_url ?? null,
      };
    }

    case "tiktok": {
      const res = await httpRequest<{
        data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
      }>(`${TIKTOK_OPEN_API_URL}/user/info/`, {
        query: { fields: "open_id,display_name,avatar_url" },
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil TikTok", false);
      const user = (await res.json()).data?.user;
      if (!user?.open_id)
        throw new PublishError(
          "oauth_no_profile",
          "Profil TikTok tidak mengembalikan open_id",
          false,
        );
      return {
        platformAccountId: user.open_id,
        username: user.display_name ?? user.open_id,
        displayName: user.display_name ?? null,
        avatarUrl: user.avatar_url ?? null,
      };
    }

    case "youtube": {
      const res = await httpRequest<{
        items?: Array<{
          id?: string;
          snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
        }>;
      }>(`${YOUTUBE_API_URL}/channels`, {
        query: { part: "snippet", mine: "true" },
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil channel YouTube", false);
      const channel = (await res.json()).items?.[0];
      if (!channel?.id)
        throw new PublishError(
          "oauth_no_channel",
          "Tidak ada channel YouTube pada akun ini",
          false,
        );
      return {
        platformAccountId: channel.id,
        username: channel.snippet?.title ?? channel.id,
        displayName: channel.snippet?.title ?? null,
        avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
      };
    }

    case "google_business": {
      const res = await httpRequest<{
        accounts?: Array<{ name: string; accountName?: string }>;
      }>(`${GBP_ACCOUNT_API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!res.ok) {
        // Surface status + body: 403 SERVICE_DISABLED (API belum di-enable),
        // 429/403 quota (Basic Access belum approve), dst — jangan telan detailnya
        const body = await res.text().catch(() => "");
        throw new PublishError(
          "oauth_profile_failed",
          `Gagal mengambil akun Google Business (${res.status}): ${body.slice(0, 200)}`,
          false,
        );
      }
      const account = (await res.json()).accounts?.[0];
      if (!account)
        throw new PublishError("oauth_no_gbp", "Tidak ada akun Google Business Profile", false);
      return {
        platformAccountId: account.name, // "accounts/123"
        username: account.accountName ?? account.name,
        displayName: account.accountName ?? null,
      };
    }

    case "pinterest": {
      // GET /v5/user_account → response FLAT { id, username, profile_image, ... }
      // (bukan wrapper { data } — cek docs developers.pinterest.com)
      const res = await httpRequest<{
        id?: string;
        username?: string;
        profile_image?: string;
      }>(`${PINTEREST_API_BASE_URL}/user_account`, {
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil Pinterest", false);
      const me = await res.json();
      if (!me.id)
        throw new PublishError(
          "oauth_no_profile",
          "Profil Pinterest tidak mengembalikan ID",
          false,
        );
      // Daftar board — endpoint terpisah (user_account tidak mengembalikan boards).
      // Dipakai flow pemilihan board: platformAccountId = board_id tujuan publish.
      const boardsRes = await httpRequest<{
        items?: Array<{ id: string; name: string; privacy?: string }>;
      }>(`${PINTEREST_API_BASE_URL}/boards`, {
        query: { page_size: "250" }, // max per docs — satu halaman cukup utk hampir semua akun
        headers: { Authorization: `Bearer ${at}` },
      });
      let boards = boardsRes.ok ? ((await boardsRes.json()).items ?? []) : [];

      // Sandbox: board sandbox terpisah dari production dan awalnya kosong, tidak
      // bisa dibuat lewat UI Pinterest — buat otomatis via API (scope boards:write
      // sudah diminta) agar flow connect punya board yang bisa dipilih user.
      if (boards.length === 0 && PINTEREST_SANDBOX) {
        const createRes = await httpRequest<{ id?: string; name?: string }>(
          `${PINTEREST_API_BASE_URL}/boards`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Sahabat Kreator (Sandbox)",
              description: "Board uji otomatis — lingkungan Sandbox Pinterest",
            }),
          },
        );
        if (createRes.ok) {
          const board = await createRes.json();
          if (board.id) boards = [{ id: board.id, name: board.name ?? "Sandbox board" }];
        }
      }

      return {
        platformAccountId: me.id,
        username: me.username ?? me.id,
        avatarUrl: me.profile_image ?? null,
        extra: { boards },
      };
    }

    case "linkedin": {
      // OpenID Connect userinfo → sub (person URN)
      const res = await httpRequest<{
        sub?: string;
        name?: string;
        email?: string;
        picture?: string;
      }>(LINKEDIN_USERINFO_URL, {
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil LinkedIn", false);
      const me = await res.json();
      if (!me.sub)
        throw new PublishError(
          "oauth_no_profile",
          "Profil LinkedIn tidak mengembalikan sub",
          false,
        );
      const profile: PlatformProfile = {
        platformAccountId: `urn:li:person:${me.sub}`,
        username: me.name ?? me.sub,
        displayName: me.name ?? null,
        avatarUrl: me.picture ?? null,
        extra: { email: me.email },
      };

      // Multi-company (#15): bila scope akses organization di-grant (product LinkedIn
      // ter-approve), ambil daftar company tempat user ADMIN → user pilih profil pribadi
      // vs company via picker. Tanpa scope / fetch gagal → person-only (flow lama tetap jalan).
      if (LINKEDIN_ORG_ACCESS_SCOPES.some((scope) => token.scopes.includes(scope))) {
        const organizations = await fetchLinkedInAdminOrganizations(at);
        if (organizations.length > 0) {
          profile.extra = {
            email: me.email,
            person: { sub: me.sub, name: me.name ?? me.sub },
            organizations,
          };
        }
      }
      return profile;
    }

    case "linkedin_org": {
      // App Community Management API TIDAK punya scope `openid` → /v2/userinfo
      // tidak tersedia, jadi identitas user tidak diambil sama sekali. Satu-satunya
      // entitas = halaman company tempat user ADMIN (organizationAcls).
      // `strict` → error HTTP di-throw dengan pesan jelas, bukan picker kosong.
      const organizations = await fetchLinkedInAdminOrganizations(at, { strict: true });
      if (organizations.length === 0) {
        throw new PublishError(
          "oauth_no_organization",
          "Tidak ada halaman company LinkedIn yang bisa dihubungkan. Pastikan Anda berperan ADMIN di halaman company tersebut.",
          false,
        );
      }
      // Identitas profil tidak dipakai flow ini — callback selalu mengarahkan user
      // ke picker (profile.extra.organizations). Nilai di bawah hanya placeholder.
      const primary = organizations[0]!;
      return {
        platformAccountId: `urn:li:organization:${primary.id}`,
        username: primary.name,
        displayName: primary.name,
        avatarUrl: null,
        extra: { organizations },
      };
    }

    case "bluesky":
      throw new PublishError(
        "oauth_bluesky_app_password",
        "Bluesky connect via app password (input manual), bukan OAuth redirect.",
        false,
      );
  }
}

// ---------------------------------------------------------------------------
// LinkedIn — daftar company yang di-admin user (multi-company, note.md #15)
// ---------------------------------------------------------------------------

/** Company LinkedIn tempat user berperan ADMIN (hasil organizationAcls finder) */
export type LinkedInOrganization = {
  /** Organization ID numerik (urn:li:organization:{id}) */
  id: string;
  /** Nama tampilan (localizedName) */
  name: string;
  /** Vanity name (mis. "acme-corp") — null bila company belum set */
  vanityName: string | null;
};

/**
 * GET /rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED — company tempat user
 * ADMIN. Butuh scope `rw_organization_admin` dari product ter-approve (Community Management API,
 * bukan self-serve). Return [] bila gagal (scope belum granted / product belum approved) — caller
 * fallback ke person-only.
 *
 * Bentuk respons (doc resmi li-lms-2026-08, update 30 Apr 2026): URN organization dikembalikan
 * sebagai `organizationTarget` pada contoh paginasi dan sebagai `organization` pada contoh lain —
 * kedua field diterima. Finder ini TIDAK memuat `localizedName`/`vanityName` (tidak ada projection
 * resmi untuk itu), jadi nama diambil via Organization Lookup `GET /rest/organizations/{id}`.
 *
 * `strict: true` (dipakai flow `linkedin_org`) → error HTTP di-throw, bukan dianggap "tanpa
 * company", supaya kegagalan scope/review app tidak tersamar sebagai picker kosong.
 */
async function fetchLinkedInAdminOrganizations(
  at: string,
  opts: { strict?: boolean } = {},
): Promise<LinkedInOrganization[]> {
  const headers = {
    Authorization: `Bearer ${at}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
  const res = await httpRequest<{
    elements?: Array<{
      organizationTarget?: string;
      organization?: string | { id?: number | string };
      role?: string;
      state?: string;
    }>;
  }>(`${LINKEDIN_REST_URL}/rest/organizationAcls`, {
    query: { q: "roleAssignee", role: "ADMINISTRATOR", state: "APPROVED" },
    headers,
    retries: 0, // gagal cepat — 403 scope berarti product belum approved, jangan retry
  });
  if (!res.ok) {
    if (opts.strict) {
      throw new PublishError(
        "oauth_org_lookup_failed",
        `Gagal mengambil daftar halaman company LinkedIn (HTTP ${res.status}) — pastikan app Community Management API sudah approved & user adalah ADMIN halaman.`,
        false,
      );
    }
    return [];
  }

  const data = await res.json();
  const seen = new Set<string>();
  const organizations: LinkedInOrganization[] = [];
  for (const el of data.elements ?? []) {
    const id = linkedinOrganizationId(el.organizationTarget ?? el.organization);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const detail = await fetchLinkedInOrganization(id, at);
    organizations.push({
      id,
      name: detail?.name ?? id, // fallback: Organization Lookup gagal → tampilkan ID
      vanityName: detail?.vanityName ?? null,
    });
  }
  return organizations;
}

/** Organization ID numerik dari URN `urn:li:organization:{id}` (atau objek `organization`). */
function linkedinOrganizationId(
  value: string | { id?: number | string } | undefined,
): string | null {
  const raw = typeof value === "string" ? value : value?.id != null ? String(value.id) : null;
  if (!raw) return null;
  const id = raw.startsWith("urn:li:") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  return /^\d+$/.test(id) ? id : null;
}

/** Organization Lookup admin — `localizedName` + `vanityName`; null bila gagal (403/dsb). */
async function fetchLinkedInOrganization(
  id: string,
  at: string,
): Promise<{ name: string; vanityName: string | null } | null> {
  const res = await httpRequest<{ localizedName?: string; vanityName?: string }>(
    `${LINKEDIN_REST_URL}/rest/organizations/${id}`,
    {
      headers: {
        Authorization: `Bearer ${at}`,
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      retries: 0,
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const name = data.localizedName ?? data.vanityName;
  return name ? { name, vanityName: data.vanityName ?? null } : null;
}
