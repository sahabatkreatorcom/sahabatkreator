// Profil fetch per platform — untuk upsert social_account.

import {
  GBP_ACCOUNT_API_URL,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_URL,
  LINKEDIN_USERINFO_URL,
  PINTEREST_API_BASE_URL,
  PINTEREST_SANDBOX,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "../config";
import { httpRequest } from "../http";
import { PublishError } from "../types";
import { fetchLinkedInAdminOrganizations } from "./linkedin";
import { LINKEDIN_ORG_ACCESS_SCOPES } from "./platform-configs";
import type { OAuthPlatform, PlatformProfile, TokenResult } from "./types";

export type GbpAccount = { name: string; accountName?: string };

// Cache daftar akun GBP 5 menit. Kuota Business Profile API per menit kecil
// (sering 429), dan account list dipanggil berulang saat connect + admin test.
const GBP_ACCOUNTS_TTL_MS = 5 * 60 * 1000;
let gbpAccountsCache: { key: string; data: GbpAccount[]; fetchedAt: number } | null = null;

/**
 * Daftar akun Google Business Profile (accounts.list) dengan cache in-memory.
 * Melempar PublishError berisi status + body agar 429/403 terlihat jelas.
 */
export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const key = `${accessToken.slice(0, 16)}:${accessToken.length}`;
  if (
    gbpAccountsCache &&
    gbpAccountsCache.key === key &&
    Date.now() - gbpAccountsCache.fetchedAt < GBP_ACCOUNTS_TTL_MS
  ) {
    return gbpAccountsCache.data;
  }

  const res = await httpRequest<{ accounts?: GbpAccount[] }>(`${GBP_ACCOUNT_API_URL}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PublishError(
      "oauth_profile_failed",
      `Gagal mengambil akun Google Business (${res.status}): ${body.slice(0, 200)}`,
      res.status === 429 || res.status >= 500,
    );
  }

  const accounts = (await res.json()).accounts ?? [];
  gbpAccountsCache = { key, data: accounts, fetchedAt: Date.now() };
  return accounts;
}

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
      // listGbpAccounts: cached 5 menit + surface status/body (403/429) apa adanya
      const accounts = await listGbpAccounts(at);
      const account = accounts[0];
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

    case "shopee":
      throw new PublishError(
        "oauth_shopee_bridge_only",
        "Shopee connect hanya via bridge Repliz (seller auth), bukan OAuth native.",
        false,
      );
  }
}
