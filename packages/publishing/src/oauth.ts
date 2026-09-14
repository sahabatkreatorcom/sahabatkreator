// OAuth 2.0 connect flow per platform — authorize URL, token exchange, profil user
// Riset: docs/social-platforms/{README,app-review-playbook,per-platform}.md (Sep 2026)
//
// Desain:
// - Kredensial app (client_id/secret) dari tabel platform_credential (fallback env)
// - State CSRF disimpan server-side (tabel oauth_state, TTL 10 menit, sekali pakai)
// - Redirect URI: {SERVER_URL}/api/oauth/{platform}/callback

import { LINKEDIN_API_VERSION, META_GRAPH_VERSION } from "./config";
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

const GRAPH_VERSION = META_GRAPH_VERSION;

export const OAUTH_CONFIGS: Record<OAuthPlatform, OAuthConfig> = {
  // Instagram via FB Login — Graph API, Page-scoped
  instagram: {
    authorizeUrl: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
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
    authorizeUrl: "https://www.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_messages",
      "instagram_business_manage_insights", // media insights utk analytics
    ],
  },
  facebook: {
    authorizeUrl: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
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
    authorizeUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
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
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
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
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
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
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/business.manage",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
    scopeSeparator: " ",
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  },
  pinterest: {
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"],
    scopeSeparator: ",",
    basicAuth: true,
  },
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "email", "w_member_social"],
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
  const accessToken: string | undefined = data.access_token ?? data.data?.access_token; // TikTok: { data: { access_token } }
  if (!accessToken) {
    throw new PublishError(
      "oauth_no_token",
      `Response token ${platform} tidak berisi access_token`,
      false,
    );
  }

  const expiresIn = Number(data.expires_in ?? data.data?.expires_in);
  return {
    accessToken,
    refreshToken: data.refresh_token ?? data.data?.refresh_token ?? undefined,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    // Pakai scope yang di-grant platform bila tersedia (LinkedIn mengirim field "scope";
    // dipakai fetchProfile untuk deteksi scope organization) — fallback ke yang diminta
    scopes: parseGrantedScopes(data) ?? requestedScopes(platform, cred),
  };
}

/** Refresh token (AT habis — TikTok 24j, Pinterest 30hr, Google, LinkedIn 60hr) */
export async function refreshAccessToken(
  platform: OAuthPlatform,
  cred: AppCredential,
  refreshToken: string,
): Promise<TokenResult> {
  const config = OAUTH_CONFIGS[platform];
  if (!config?.tokenUrl) {
    throw new PublishError("oauth_not_supported", `OAuth ${platform} tidak didukung.`, false);
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
    const meRes = await httpRequest<{ name?: string; email?: string }>(
      `https://graph.facebook.com/${GRAPH_VERSION}/me`,
      { query: { access_token: accessToken, fields: "name,email" } },
    );
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
          instagram_business_account?: { id: string; username?: string };
        }>;
      }>(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`, {
        query: {
          access_token: at,
          fields: "id,name,access_token,instagram_business_account{id,username}",
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
        extra: {
          pageId: page.id,
          pageAccessToken: page.access_token,
          // access_token + instagram_business_account WAJIB ikut — dipakai
          // buildPendingPages (multi-Page) utk enkripsi page token per Page
          pages: pages.map((p) => ({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
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
      }>(`https://graph.instagram.com/${GRAPH_VERSION}/me`, {
        query: { fields: "id,username,account_type", access_token: at },
      });
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil Instagram", false);
      const me = await res.json();
      if (!me.id)
        throw new PublishError("oauth_no_profile", "Profil IG tidak mengembalikan ID", false);
      return { platformAccountId: me.id, username: me.username ?? me.id };
    }

    case "facebook": {
      const res = await httpRequest<{
        data?: Array<{ id: string; name: string; access_token: string }>;
      }>(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`, {
        query: { access_token: at, fields: "id,name,access_token" },
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
        extra: {
          pageAccessToken: page.access_token,
          // access_token WAJIB ikut — dipakai buildPendingPages (multi-Page)
          pages: pages.map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
        },
      };
    }

    case "threads": {
      const res = await httpRequest<{ id?: string; username?: string }>(
        "https://graph.threads.net/v1.0/me",
        { query: { fields: "id,username", access_token: at } },
      );
      if (!res.ok)
        throw new PublishError("oauth_profile_failed", "Gagal mengambil profil Threads", false);
      const me = await res.json();
      if (!me.id)
        throw new PublishError("oauth_no_profile", "Profil Threads tidak mengembalikan ID", false);
      return { platformAccountId: me.id, username: me.username ?? me.id };
    }

    case "tiktok": {
      const res = await httpRequest<{
        data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
      }>("https://open.tiktokapis.com/v2/user/info/", {
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
      }>("https://www.googleapis.com/youtube/v3/channels", {
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
      }>("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!res.ok)
        throw new PublishError(
          "oauth_profile_failed",
          "Gagal mengambil akun Google Business",
          false,
        );
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
      }>("https://api.pinterest.com/v5/user_account", {
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
      }>("https://api.pinterest.com/v5/boards", {
        query: { page_size: "250" }, // max per docs — satu halaman cukup utk hampir semua akun
        headers: { Authorization: `Bearer ${at}` },
      });
      const boards = boardsRes.ok ? ((await boardsRes.json()).items ?? []) : [];
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
      }>("https://api.linkedin.com/v2/userinfo", {
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

      // Multi-company (#15): bila scope r_organization_admin di-grant (product LinkedIn
      // ter-approve), ambil daftar company tempat user ADMIN → user pilih profil pribadi
      // vs company via picker. Tanpa scope / fetch gagal → person-only (flow lama tetap jalan).
      if (token.scopes.includes("r_organization_admin")) {
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
 * GET /rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR — company tempat user ADMIN.
 * Butuh scope r_organization_admin (product LinkedIn ter-approve).
 * Return [] bila gagal (scope belum granted / product belum approved) — caller fallback person-only.
 */
async function fetchLinkedInAdminOrganizations(at: string): Promise<LinkedInOrganization[]> {
  const version = LINKEDIN_API_VERSION;
  const res = await httpRequest<{
    elements?: Array<{
      organizationReference?: string;
      organization?: string | { id?: number | string; localizedName?: string; vanityName?: string };
      // Resolusi projection "organization~" (Rest.li decoration)
      "organization~"?: { id?: number | string; localizedName?: string; vanityName?: string };
      role?: string;
      state?: string;
    }>;
  }>("https://api.linkedin.com/rest/organizationAcls", {
    query: {
      q: "roleAssignee",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      projection:
        "(elements*(organizationReference,role,state,organization~(id,localizedName,vanityName)))",
    },
    headers: {
      Authorization: `Bearer ${at}`,
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    retries: 0, // gagal cepat — 403 scope berarti product belum approved, jangan retry
  });
  if (!res.ok) return [];

  const data = await res.json();
  const seen = new Set<string>();
  const organizations: LinkedInOrganization[] = [];
  for (const el of data.elements ?? []) {
    // organizationAcls mengembalikan organizationReference URN + resolusi "organization~"
    const resolved =
      el["organization~"] ?? (typeof el.organization === "object" ? el.organization : null);
    const id = resolved?.id != null ? String(resolved.id) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    organizations.push({
      id,
      name: resolved?.localizedName ?? resolved?.vanityName ?? id,
      vanityName: resolved?.vanityName ?? null,
    });
  }
  return organizations;
}
