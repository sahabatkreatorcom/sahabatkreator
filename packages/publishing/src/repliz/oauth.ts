// OAuth Account Connect (Gold+) — authorize, exchange, get page/channel/org,
// connect, reconnect. Docs: docs/repliz/Oauth/
//
// Catatan platform: Repliz hanya punya SATU type "linkedin" — app LinkedIn
// mereka membawahi scope personal (w_member_social) + company
// (rw_organization_admin) sekaligus. Karena itu `linkedin` dan `linkedin_org`
// SAMA-SAMA dipetakan ke "linkedin"; pemisahan personal vs company dilakukan di
// callback lewat filter URN (urn:li:person: vs urn:li:organization:) —
// konsisten dgn flow native.

import type {
  ReplizChannel,
  ReplizOrganization,
  ReplizPage,
} from "./account";
import { replizEmpty, replizMissingId, replizRequest, type ReplizCredentials } from "./shared";

export const REPLIZ_PLATFORMS = {
  facebook: "facebook",
  instagram: "instagram",
  instagram_standalone: "instagram",
  threads: "threads",
  tiktok: "tiktok",
  youtube: "youtube",
  linkedin: "linkedin",
  linkedin_org: "linkedin",
  shopee: "shopee",
} as const;

export type ReplizPlatformKey = keyof typeof REPLIZ_PLATFORMS;
export const REPLIZ_SUPPORTED: readonly string[] = Object.keys(REPLIZ_PLATFORMS);

/**
 * Mulai flow OAuth via app milik Repliz: dapatkan URL authorize platform.
 * `redirect` = URL callback kita — platform akan mengembalikan code ke sana.
 */
export async function replizAuthorizeUrl(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  redirect: string,
): Promise<string> {
  const type = REPLIZ_PLATFORMS[platformKey];
  const data = await replizRequest<{ url: string }>(cred, `/public/account/${type}/authorize`, {
    query: { redirect },
  });
  if (!data?.url) {
    throw replizMissingId("repliz_no_authorize_url", "Repliz tidak mengembalikan URL authorize.", false);
  }
  return data.url;
}

/** Exchange authorization code → user access token Repliz (facebook/linkedin/youtube) */
export async function replizExchangeCode(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  code: string,
): Promise<string> {
  const type = REPLIZ_PLATFORMS[platformKey];
  const data = await replizRequest<{ token: string }>(cred, `/public/account/${type}/exchange`, {
    method: "POST",
    body: { code },
  });
  if (!data?.token) {
    throw replizMissingId("repliz_no_token", "Repliz tidak mengembalikan token exchange.", false);
  }
  return data.token;
}

/** Ambil daftar Page Facebook milik user (dengan page token masing-masing) */
export async function replizGetFacebookPages(
  cred: ReplizCredentials,
  token: string,
): Promise<ReplizPage[]> {
  const data = await replizRequest<{ docs: ReplizPage[] }>(cred, "/public/account/facebook/page", {
    query: { token },
  });
  return data?.docs ?? [];
}

/** Ambil daftar channel YouTube milik user (dengan channel token masing-masing) */
export async function replizGetYouTubeChannels(
  cred: ReplizCredentials,
  token: string,
): Promise<ReplizChannel[]> {
  const data = await replizRequest<{ docs: ReplizChannel[] }>(cred, "/public/account/youtube/channel", {
    query: { token },
  });
  return data?.docs ?? [];
}

/** Ambil daftar LinkedIn organization yang di-admin user (dengan org token) */
export async function replizGetLinkedInOrganizations(
  cred: ReplizCredentials,
  token: string,
): Promise<ReplizOrganization[]> {
  const data = await replizRequest<{ docs: ReplizOrganization[] }>(
    cred,
    "/public/account/linkedin/organization",
    { query: { token } },
  );
  return data?.docs ?? [];
}

/**
 * Hubungkan akun ke workspace Repliz → accountId.
 * Flow per platform (docs.repliz.com):
 * - instagram / threads / tiktok: { code } — tanpa exchange
 * - facebook:    { pageId, token }
 * - youtube:     { channelId, token }
 * - linkedin:    { organizationId, token }
 * - shopee:      { code } — code = `{code}_{shop_id}` dari redirect Shopee
 */
export type ReplizConnectInput =
  | { code: string }
  | { pageId: string; token: string }
  | { channelId: string; token: string }
  | { organizationId: string; token: string };

export async function replizConnectAccount(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  input: ReplizConnectInput,
): Promise<string> {
  const type = REPLIZ_PLATFORMS[platformKey];
  const data = await replizRequest<{ accountId: string }>(cred, `/public/account/${type}/connect`, {
    method: "POST",
    body: input,
  });
  if (!data?.accountId) {
    throw replizMissingId("repliz_no_account_id", "Repliz tidak mengembalikan accountId.", false);
  }
  return data.accountId;
}

/**
 * Reconnect akun yang token-nya expired (POST /connect/{accountId}).
 * Catatan: entity id (pageId/channelId/organizationId) HARUS sama dengan connect awal
 * (error 400 "incorrect generatedId"); instagram/threads/tiktok/shopee kirim ulang code.
 */
export async function replizReconnectAccount(
  cred: ReplizCredentials,
  platformKey: ReplizPlatformKey,
  accountId: string,
  input: ReplizConnectInput,
): Promise<void> {
  const type = REPLIZ_PLATFORMS[platformKey];
  await replizEmpty(cred, `/public/account/${type}/connect/${accountId}`, {
    method: "POST",
    body: input,
  });
}

/**
 * Bangun input reconnect dari data akun yang tersimpan.
 * Shopee & instagram/threads/tiktok butuh code baru (OAuth ulang); page/channel/
 * organization butuh entity id + token. Dipakai flow reconnect di route accounts.
 */
export function replizReconnectInput(
  platformKey: ReplizPlatformKey,
  entityId: string,
  token: string,
): ReplizConnectInput {
  if (platformKey === "facebook") return { pageId: entityId, token };
  if (platformKey === "youtube") return { channelId: entityId, token };
  if (platformKey === "linkedin" || platformKey === "linkedin_org")
    return { organizationId: entityId, token };
  return { code: token }; // shopee / instagram / threads / tiktok
}

/** Type guard platform yang butuh exchange sebelum connect */
export function replizNeedsExchange(platformKey: ReplizPlatformKey): boolean {
  return platformKey === "facebook" || platformKey === "linkedin" || platformKey === "youtube";
}

/** Type guard platform yang butuh entity selection setelah exchange */
export function replizNeedsEntity(platformKey: ReplizPlatformKey): boolean {
  return (
    platformKey === "facebook" ||
    platformKey === "youtube" ||
    platformKey === "linkedin" ||
    platformKey === "linkedin_org"
  );
}

