// Core bersama suite diagnostik API platform — tipe, daftar platform,
// credential resolver, dan wrapper runCheck.
// Dipakai admin-api-tests-meta.ts, admin-api-tests-platforms.ts, admin-api-tests.ts.
// Prinsip keamanan: hasil test TIDAK PERNAH berisi secret/token —
// hanya status (pass/fail/warn) + pesan + durasi.

import { db } from "@sahabatkreator/db";
import { platformCredential, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "../lib/crypto";

/** Hasil satu check diagnostik */
export type TestStatus = "pass" | "fail" | "warn";

export type TestResult = {
  name: string;
  status: TestStatus;
  message: string;
  durationMs: number;
};

export type PlatformKey =
  | "instagram"
  | "instagram_standalone"
  | "facebook"
  | "threads"
  | "tiktok"
  | "youtube"
  | "google_business"
  | "pinterest"
  | "linkedin"
  | "linkedin_org"
  | "bluesky";

/** Suite yang tersedia — key dipakai di URL POST /run/:platform */
export const AVAILABLE_PLATFORMS: PlatformKey[] = [
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "google_business",
  "pinterest",
  "linkedin",
  "linkedin_org",
  "bluesky",
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Bungkus eksekusi check dengan pengukuran durasi + try/catch */
export async function runCheck(
  name: string,
  fn: () => Promise<Omit<TestResult, "name" | "durationMs">>,
): Promise<TestResult> {
  const start = Date.now();
  try {
    const { status, message } = await fn();
    return { name, status, message, durationMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      status: "fail",
      message: `Error tak terduga: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - start,
    };
  }
}

/** Mapping platform → env kredensial (sama dengan oauth.ts — DB prioritas, env fallback) */
const ENV_CREDENTIAL_KEYS: Partial<Record<PlatformKey, { id: string; secret: string }>> = {
  // Instagram & Facebook — satu aplikasi Meta
  instagram: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  // Instagram Login — app terpisah, kredensial sendiri
  instagram_standalone: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
  facebook: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  threads: { id: "THREADS_APP_ID", secret: "THREADS_APP_SECRET" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
  // YouTube & GBP share satu Google OAuth client
  youtube: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  google_business: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  pinterest: { id: "PINTEREST_APP_ID", secret: "PINTEREST_APP_SECRET" },
  linkedin: { id: "LINKEDIN_CLIENT_ID", secret: "LINKEDIN_CLIENT_SECRET" },
  linkedin_org: { id: "LINKEDIN_ORG_CLIENT_ID", secret: "LINKEDIN_ORG_CLIENT_SECRET" },
  // Bluesky tanpa app credential — auth via app password per akun (connect manual)
};

/**
 * Ambil kredensial platform: DB platform_credential (decrypt secret) → fallback env.
 * Return null bila tidak ada sama sekali.
 */
export async function getCredential(
  platform: PlatformKey,
): Promise<{ clientId: string; clientSecret: string; source: "db" | "env" } | null> {
  const [cred] = await db
    .select({
      clientId: platformCredential.clientId,
      clientSecretEnc: platformCredential.clientSecretEnc,
    })
    .from(platformCredential)
    .where(
      and(
        eq(platformCredential.platform, platform as never),
        eq(platformCredential.isActive, true),
      ),
    )
    .limit(1);

  if (cred) {
    try {
      return {
        clientId: cred.clientId,
        clientSecret: decrypt(cred.clientSecretEnc),
        source: "db",
      };
    } catch {
      // Secret tersimpan tapi gagal decrypt (ENCRYPTION_KEY ganti?) — coba env
    }
  }

  const envKeys = ENV_CREDENTIAL_KEYS[platform];
  if (!envKeys) return null;
  const clientId = process.env[envKeys.id];
  const clientSecret = process.env[envKeys.secret];
  if (clientId && clientSecret) {
    return { clientId, clientSecret, source: "env" };
  }
  return null;
}

/** Data akun sosial tersimpan (token + refresh + expiry) untuk suite non-Meta */
export async function getStoredAccount(platform: string): Promise<{
  platformAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
} | null> {
  const [account] = await db
    .select({
      platformAccountId: socialAccount.platformAccountId,
      accessTokenEnc: socialAccount.accessTokenEnc,
      refreshTokenEnc: socialAccount.refreshTokenEnc,
      tokenExpiresAt: socialAccount.tokenExpiresAt,
    })
    .from(socialAccount)
    .where(eq(socialAccount.platform, platform as never))
    .limit(1);
  if (!account) return null;
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  try {
    accessToken = account.accessTokenEnc ? decrypt(account.accessTokenEnc) : null;
    refreshToken = account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : null;
  } catch {
    // decrypt gagal (ENCRYPTION_KEY ganti) — anggap token tidak tersedia
  }
  return {
    platformAccountId: account.platformAccountId,
    accessToken,
    refreshToken,
    tokenExpiresAt: account.tokenExpiresAt,
  };
}
