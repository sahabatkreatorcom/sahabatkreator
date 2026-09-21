// OAuth 2.0 connect flow per platform — authorize URL, token exchange, profil user.
// Riset: docs/social-platforms/{README,app-review-playbook,per-platform}.md (Sep 2026)
//
// Desain:
// - Kredensial app (client_id/secret) dari tabel platform_credential (fallback env)
// - State CSRF disimpan server-side (tabel oauth_state, TTL 10 menit, sekali pakai)
// - Redirect URI: {SERVER_URL}/api/oauth/{platform}/callback
//
// Modul:
// - types: tipe bersama (OAuthPlatform, AppCredential, TokenResult, PlatformProfile)
// - platform-configs: OAUTH_CONFIGS + isOAuthPlatformSupported
// - scopes: penggabungan scope config + extra & parsing scope granted
// - authorize: buildAuthorizeUrl + exchangeCodeForToken + refreshAccessToken
// - profile: fetchPlatformProfile per platform
// - linkedin: daftar company admin LinkedIn

export { buildAuthorizeUrl, exchangeCodeForToken, refreshAccessToken } from "./authorize";
export {
  isOAuthPlatformSupported,
  LINKEDIN_ORG_ACCESS_SCOPES,
  OAUTH_CONFIGS,
} from "./platform-configs";
export type { GbpAccount } from "./profile";
export { fetchPlatformProfile, listGbpAccounts } from "./profile";
export type {
  AppCredential,
  LinkedInOrganization,
  OAuthPlatform,
  PlatformProfile,
  TokenResult,
} from "./types";
