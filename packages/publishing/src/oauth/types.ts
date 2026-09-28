// Tipe bersama OAuth 2.0 connect flow per platform.

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
export type OAuthConfig = {
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

/** Company LinkedIn tempat user berperan ADMIN (hasil organizationAcls finder) */
export type LinkedInOrganization = {
  /** Organization ID numerik (urn:li:organization:{id}) */
  id: string;
  /** Nama tampilan (localizedName) */
  name: string;
  /** Vanity name (mis. "acme-corp") — null bila company belum set */
  vanityName: string | null;
};
