// Token refresh otomatis — worker memanggil refreshDueTokens tiap jam.
// Akun dengan tokenExpiresAt mendekati expired (< 2 hari) di-refresh proaktif
// agar publish tidak gagal massal. Akun expired tanpa refresh token ditandai
// needsReconnect untuk ditampilkan di UI.

import { db } from "@sahabatkreator/db";
import { decrypt, encrypt } from "@sahabatkreator/db/crypto";
import { platformCredential, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { type AppCredential, type OAuthPlatform, refreshAccessToken } from "./oauth";

/** Refresh window: 2 hari sebelum expired */
const REFRESH_AHEAD_MS = 2 * 24 * 60 * 60 * 1000;

/** Mapping env kredensial per platform (fallback bila platform_credential kosong) */
const ENV_KEYS: Partial<Record<OAuthPlatform, { id: string; secret: string }>> = {
  instagram: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  instagram_standalone: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
  facebook: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  threads: { id: "THREADS_APP_ID", secret: "THREADS_APP_SECRET" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
  youtube: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  google_business: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  pinterest: { id: "PINTEREST_APP_ID", secret: "PINTEREST_APP_SECRET" },
  linkedin: { id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET" },
};

async function getAppCredential(platform: OAuthPlatform): Promise<AppCredential | null> {
  const [cred] = await db
    .select()
    .from(platformCredential)
    .where(
      and(
        eq(platformCredential.platform, platform as never),
        eq(platformCredential.isActive, true),
      ),
    )
    .limit(1);

  let clientId: string | undefined;
  let clientSecret: string | undefined;
  if (cred) {
    clientId = cred.clientId;
    try {
      clientSecret = decrypt(cred.clientSecretEnc);
    } catch {
      clientSecret = undefined;
    }
  }
  const envKeys = ENV_KEYS[platform];
  if (!clientId && envKeys) clientId = process.env[envKeys.id];
  if (!clientSecret && envKeys) clientSecret = process.env[envKeys.secret];
  if (!clientId || !clientSecret) return null;

  const serverUrl = process.env.SERVER_URL || "http://localhost:3000";
  return {
    clientId,
    clientSecret,
    redirectUri: cred?.redirectUri || `${serverUrl}/api/oauth/${platform}/callback`,
  };
}

export type TokenRefreshResult = {
  checked: number;
  refreshed: number;
  failed: number;
  expired: number;
  errors: string[];
};

/**
 * Refresh semua akun yang token-nya expired dalam ≤2 hari (atau sudah expired).
 * Dipanggil worker tiap jam; aman dipanggil berulang (idempotent — akun yang
 * sudah fresh tidak di-refresh lagi).
 */
export async function refreshDueTokens(limit = 20): Promise<TokenRefreshResult> {
  const result: TokenRefreshResult = {
    checked: 0,
    refreshed: 0,
    failed: 0,
    expired: 0,
    errors: [],
  };
  const now = new Date();
  const ahead = new Date(now.getTime() + REFRESH_AHEAD_MS);

  // Akun aktif dengan token expires ≤ 2 hari ke depan
  const due = await db
    .select({
      id: socialAccount.id,
      platform: socialAccount.platform,
      refreshTokenEnc: socialAccount.refreshTokenEnc,
      tokenExpiresAt: socialAccount.tokenExpiresAt,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.isConnected, true),
        isNotNull(socialAccount.tokenExpiresAt),
        lt(socialAccount.tokenExpiresAt, ahead),
      ),
    )
    .limit(limit);

  result.checked = due.length;
  if (due.length === 0) return result;

  for (const account of due) {
    try {
      // Akun bridge Repliz: token platform disimpan Repliz, bukan kita — tidak ada yang di-refresh.
      // Health dicek via GET /public/account/{id} (isConnected), dilakukan engagement-sync.
      if (account.metadata?.replizAccountId) continue;
      // Sudah expired dan tidak ada refresh token → tandai perlu hubungkan ulang
      if (!account.refreshTokenEnc) {
        if (account.tokenExpiresAt && account.tokenExpiresAt < now) {
          await db
            .update(socialAccount)
            .set({ needsReconnect: true })
            .where(eq(socialAccount.id, account.id));
          result.expired++;
        }
        continue;
      }

      const cred = await getAppCredential(account.platform as OAuthPlatform);
      if (!cred) {
        result.errors.push(`${account.platform}: kredensial app tidak ditemukan`);
        continue;
      }

      const refreshToken = decrypt(account.refreshTokenEnc);
      const token = await refreshAccessToken(account.platform as OAuthPlatform, cred, refreshToken);

      // Rotasi refresh token bila platform mengembalikan yang baru (Google, dsb.)
      const newRefreshEnc = token.refreshToken
        ? encrypt(token.refreshToken)
        : account.refreshTokenEnc;

      await db
        .update(socialAccount)
        .set({
          accessTokenEnc: encrypt(token.accessToken),
          refreshTokenEnc: newRefreshEnc,
          tokenExpiresAt: token.expiresAt ?? null,
          needsReconnect: false,
        })
        .where(eq(socialAccount.id, account.id));
      result.refreshed++;
    } catch (err) {
      result.failed++;
      result.errors.push(
        `${account.platform} (${account.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
      // Refresh gagal & token sudah lewat → tandai perlu hubungkan ulang
      if (account.tokenExpiresAt && account.tokenExpiresAt < now) {
        await db
          .update(socialAccount)
          .set({ needsReconnect: true })
          .where(eq(socialAccount.id, account.id));
      }
    }
  }

  return result;
}

/**
 * Refresh token satu akun atas permintaan (self-heal posts-sync saat token
 * ditolak platform 401 — mis. AT dicabut/lewat masa aktif sebelum jadwal worker).
 * Return access token baru, atau null bila akun tidak punya RT / kredensial app
 * tidak ada / refresh gagal — pemanggil melanjutkan dengan error asli sehingga
 * akun ditandai needsReconnect.
 *
 * Token baru dipropagasikan ke semua row se-org dengan username platform sama:
 * Pinterest (dan LinkedIn) menyimpan token user-level yang sama di banyak
 * entitas (board/company) — refresh satu row merotasi RT, row lain harus ikut
 * agar tidak mati bergantian.
 */
export async function refreshAccountToken(account: {
  organizationId: string;
  platform: string;
  username: string;
  refreshTokenEnc: string | null;
}): Promise<string | null> {
  if (!account.refreshTokenEnc) return null;
  try {
    const refreshToken = decrypt(account.refreshTokenEnc);
    const cred = await getAppCredential(account.platform as OAuthPlatform);
    if (!cred) return null;
    const token = await refreshAccessToken(account.platform as OAuthPlatform, cred, refreshToken);

    await db
      .update(socialAccount)
      .set({
        accessTokenEnc: encrypt(token.accessToken),
        ...(token.refreshToken ? { refreshTokenEnc: encrypt(token.refreshToken) } : {}),
        tokenExpiresAt: token.expiresAt ?? null,
        needsReconnect: false,
        lastError: null,
      })
      .where(
        and(
          eq(socialAccount.organizationId, account.organizationId),
          eq(socialAccount.platform, account.platform as never),
          eq(socialAccount.username, account.username),
        ),
      );
    return token.accessToken;
  } catch {
    return null;
  }
}

/** Hitung akun yang perlu dihubungkan ulang (untuk notifikasi/dashboard) */
export async function countNeedsReconnect(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialAccount)
    .where(eq(socialAccount.needsReconnect, true));
  return row?.n ?? 0;
}
