// API Admin API Tests — suite diagnostik Graph API / platform API
// Verifikasi konfigurasi SEBELUM pengajuan App Review (audit HIGH D1).
//
// Prinsip keamanan: hasil test TIDAK PERNAH berisi secret/token —
// hanya status (pass/fail/warn) + pesan + durasi.

import { db } from "@sahabatkreator/db";
import { platformCredential, socialAccount } from "@sahabatkreator/db/schema";
import {
  BSKY_APPVIEW_URL,
  GBP_ACCOUNT_API_URL,
  GRAPH_FB_URL,
  LINKEDIN_USERINFO_URL,
  PINTEREST_API_BASE_URL,
  PINTEREST_SANDBOX,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { logAdminAction } from "../lib/audit";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";

export const apiTestsRoute = new Hono();

/** Hasil satu check diagnostik */
type TestStatus = "pass" | "fail" | "warn";

type TestResult = {
  name: string;
  status: TestStatus;
  message: string;
  durationMs: number;
};

type PlatformKey =
  | "instagram"
  | "instagram_standalone"
  | "facebook"
  | "threads"
  | "tiktok"
  | "youtube"
  | "google_business"
  | "pinterest"
  | "linkedin"
  | "bluesky";

/** Suite yang tersedia — key dipakai di URL POST /run/:platform */
const AVAILABLE_PLATFORMS: PlatformKey[] = [
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "google_business",
  "pinterest",
  "linkedin",
  "bluesky",
];

/**
 * Cache hasil terakhir per platform (in-memory — cukup untuk diagnostik
 * on-demand; tidak perlu persist, refresh halaman ulang test kapan pun).
 */
const lastResults = new Map<PlatformKey, { ranAt: string; results: TestResult[] }>();

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Bungkus eksekusi check dengan pengukuran durasi + try/catch */
async function runCheck(
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

/** Fetch JSON dengan timeout — jangan biarkan Graph API menggantung request admin */
async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {
      // body bukan JSON (mis. html error page) — biarkan null
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
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
  // Bluesky tanpa app credential — auth via app password per akun (connect manual)
};

/**
 * Ambil kredensial platform: DB platform_credential (decrypt secret) → fallback env.
 * Return null bila tidak ada sama sekali.
 */
async function getCredential(
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

/**
 * Ambil user token tersimpan (akun social pertama platform tsb, decrypt).
 * Return null bila belum ada akun terhubung.
 */
async function getStoredUserToken(platform: string): Promise<string | null> {
  const [account] = await db
    .select({ accessTokenEnc: socialAccount.accessTokenEnc })
    .from(socialAccount)
    .where(eq(socialAccount.platform, platform as never))
    .limit(1);
  if (!account?.accessTokenEnc) return null;
  try {
    return decrypt(account.accessTokenEnc);
  } catch {
    return null;
  }
}

/** Data akun sosial tersimpan (token + refresh + expiry) untuk suite non-Meta */
async function getStoredAccount(platform: string): Promise<{
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

// ---------------------------------------------------------------------------
// Suite diagnostik Meta (Instagram / Facebook)
// ---------------------------------------------------------------------------

/**
 * Resolusi verify token webhook — cermin runtime (webhook-platform.ts):
 * DB platform_credential extraConfig (form Admin → Kredensial) → fallback env.
 * Nilai token tidak pernah dikirim ke client — hanya status & sumbernya.
 */
const VERIFY_TOKEN_RESOLUTION = {
  instagram: {
    dbPlatform: "instagram",
    envKeys: ["META_WEBHOOK_VERIFY_TOKEN"],
    cardLabel: "kartu Instagram",
  },
  // /webhooks/meta membaca kredensial kartu Instagram — IG bisnis & FB
  // satu aplikasi Meta (verify token & app secret dibagikan)
  facebook: {
    dbPlatform: "instagram",
    envKeys: ["META_WEBHOOK_VERIFY_TOKEN"],
    cardLabel: "kartu Instagram (IG & FB satu aplikasi Meta)",
  },
  instagram_standalone: {
    dbPlatform: "instagram_standalone",
    envKeys: ["INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "META_WEBHOOK_VERIFY_TOKEN"],
    cardLabel: "kartu Instagram Login",
  },
  threads: {
    dbPlatform: "threads",
    envKeys: ["THREADS_WEBHOOK_VERIFY_TOKEN", "META_WEBHOOK_VERIFY_TOKEN"],
    cardLabel: "kartu Threads",
  },
} satisfies Record<
  "instagram" | "facebook" | "instagram_standalone" | "threads",
  { dbPlatform: string; envKeys: string[]; cardLabel: string }
>;

type VerifyTokenPlatform = keyof typeof VERIFY_TOKEN_RESOLUTION;

async function getVerifyTokenInfo(platform: VerifyTokenPlatform): Promise<{
  value: string | null;
  source: "db" | "env" | null;
  envKey: string | null;
}> {
  const resolution = VERIFY_TOKEN_RESOLUTION[platform];

  const [cred] = await db
    .select({ extraConfigEnc: platformCredential.extraConfigEnc })
    .from(platformCredential)
    .where(
      and(
        eq(platformCredential.platform, resolution.dbPlatform as never),
        eq(platformCredential.isActive, true),
      ),
    )
    .limit(1);
  if (cred?.extraConfigEnc) {
    try {
      const extra = JSON.parse(decrypt(cred.extraConfigEnc)) as Record<string, unknown>;
      if (typeof extra.webhookVerifyToken === "string" && extra.webhookVerifyToken.length >= 8) {
        return { value: extra.webhookVerifyToken, source: "db", envKey: null };
      }
    } catch {
      // decrypt/parse gagal (ENCRYPTION_KEY ganti?) — lanjut ke fallback env
    }
  }

  for (const key of resolution.envKeys) {
    const value = process.env[key];
    if (value && value.length >= 8) {
      return { value, source: "env", envKey: key };
    }
  }
  return { value: null, source: null, envKey: null };
}

type MetaDebugTokenResponse = {
  data?: {
    app_id?: string;
    scopes?: string[];
    is_valid?: boolean;
    expires_at?: number;
  };
  error?: { message?: string; code?: number };
};

/**
 * Check (a): kredensial app ada + format valid.
 * Format: clientId numerik (App ID Meta), secret non-empty (32-char hex).
 */
function checkMetaCredentialFormat(
  cred: { clientId: string; clientSecret: string; source: "db" | "env" } | null,
): Omit<TestResult, "name" | "durationMs"> {
  if (!cred) {
    return {
      status: "fail",
      message:
        "Kredensial app belum tersimpan. Isi di Admin Panel → Kredensial Platform (atau env META_APP_ID/META_APP_SECRET).",
    };
  }
  if (!/^\d{8,20}$/.test(cred.clientId)) {
    return {
      status: "warn",
      message:
        "Client ID terdeteksi bukan App ID numerik standar Meta. Pastikan sesuai App ID di developer console.",
    };
  }
  if (cred.clientSecret.length < 20) {
    return {
      status: "warn",
      message:
        "App Secret terlihat terlalu pendek (standar Meta 32 karakter hex). Periksa ulang nilai yang disimpan.",
    };
  }
  const sourceLabel = cred.source === "db" ? "Admin Panel (DB)" : "env";
  return {
    status: "pass",
    message: `Kredensial valid (sumber: ${sourceLabel}, Client ID ${cred.clientId.length} digit, secret ${cred.clientSecret.length} karakter).`,
  };
}

/** Check (b): app token valid — mint via client_credentials lalu GET /oauth/access_token_info */
async function checkMetaAppToken(
  cred: { clientId: string; clientSecret: string; source: "db" | "env" } | null,
): Promise<Omit<TestResult, "name" | "durationMs">> {
  if (!cred) {
    return { status: "fail", message: "Dilewati — kredensial app belum tersimpan." };
  }
  // Mint app access token dulu — /oauth/access_token_info hanya menerima
  // param access_token (client_id+client_secret langsung akan ditolak 400).
  const mintUrl =
    `${GRAPH_FB_URL}/oauth/access_token` +
    `?client_id=${encodeURIComponent(cred.clientId)}&client_secret=${encodeURIComponent(cred.clientSecret)}` +
    "&grant_type=client_credentials";
  const mintRes = await fetchJson<{ access_token?: string }>(mintUrl);
  const appToken = mintRes.data?.access_token;
  if (!mintRes.ok || !appToken) {
    // 400 = invalid credential (OAuthException)
    if (mintRes.status === 400) {
      return {
        status: "fail",
        message:
          "Meta menolak kredensial (HTTP 400 saat mint app token). App ID/Secret salah atau app sudah dihapus — cek developer console.",
      };
    }
    return {
      status: "fail",
      message: `Graph API merespons HTTP ${mintRes.status} saat mint app token — periksa koneksi jaringan.`,
    };
  }

  const infoUrl = `${GRAPH_FB_URL}/oauth/access_token_info?access_token=${encodeURIComponent(appToken)}`;
  const res = await fetchJson<{ error?: { message?: string } }>(infoUrl);
  if (res.ok) {
    return {
      status: "pass",
      message: `App token valid — Graph API menerima client_id + client_secret (HTTP ${res.status}).`,
    };
  }
  return {
    status: "fail",
    message: `Graph API merespons HTTP ${res.status} — periksa koneksi jaringan atau versi API.`,
  };
}

/** Check (c): webhook verify token terisi — DB (form admin) dulu, fallback env.
 * Cermin resolusi runtime /webhooks/* — supaya test hijau = webhook benar-benar siap. */
async function checkVerifyToken(
  platform: VerifyTokenPlatform,
): Promise<Omit<TestResult, "name" | "durationMs">> {
  const resolution = VERIFY_TOKEN_RESOLUTION[platform];
  const { value, source, envKey } = await getVerifyTokenInfo(platform);
  if (value && source === "db") {
    return {
      status: "pass",
      message: `Verify token terisi via Admin Panel (${resolution.cardLabel}) — handshake webhook (hub.verify_token) siap dipakai.`,
    };
  }
  if (value && source === "env" && envKey) {
    return {
      status: "pass",
      message: `${envKey} terisi — handshake webhook (hub.verify_token) siap dipakai.`,
    };
  }
  const envHint = resolution.envKeys.join(" atau ");
  return {
    status: "fail",
    message: `Verify token belum diisi. Isi via Admin Panel → Kredensial Platform (${resolution.cardLabel}) atau env ${envHint} — handshake GET webhook akan selalu 403.`,
  };
}

/** Check (d): debug_token user token tersimpan — tampilkan scopes & expiry */
async function checkUserToken(
  userToken: string | null,
  cred: { clientId: string; clientSecret: string; source: "db" | "env" } | null,
): Promise<Omit<TestResult, "name" | "durationMs">> {
  if (!userToken) {
    return {
      status: "warn",
      message:
        "Belum ada user token tersimpan (belum ada akun terhubung). Hubungkan minimal satu akun untuk memvalidasi permission.",
    };
  }
  if (!cred) {
    return { status: "fail", message: "Dilewati — butuh app credential untuk /debug_token." };
  }

  // App access token diperlukan sebagai access_token param untuk debug_token.
  // debug_token ada di Graph API umum (graph.facebook.com) — user token IG/FB/Threads
  // semuanya diterbitkan app Meta dan bisa diinspeksi di sana.
  const tokenUrl =
    `${GRAPH_FB_URL}/oauth/access_token` +
    `?client_id=${encodeURIComponent(cred.clientId)}&client_secret=${encodeURIComponent(cred.clientSecret)}` +
    "&grant_type=client_credentials";
  const tokenRes = await fetchJson<{ access_token?: string }>(tokenUrl);
  const appToken = tokenRes.data?.access_token;
  if (!appToken) {
    return {
      status: "fail",
      message: "Gagal mendapatkan app access token — tidak bisa panggil /debug_token.",
    };
  }

  const debugUrl =
    `${GRAPH_FB_URL}/debug_token` +
    `?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(appToken)}`;
  const res = await fetchJson<MetaDebugTokenResponse>(debugUrl);
  const d = res.data?.data;

  if (!res.ok || !d) {
    const errMsg = res.data?.error?.message ?? `HTTP ${res.status}`;
    return {
      status: "fail",
      message: `User token invalid / tidak bisa diperiksa: ${errMsg}`,
    };
  }
  if (!d.is_valid) {
    return { status: "fail", message: "User token tidak valid — akun perlu dihubungkan ulang." };
  }

  const scopes = d.scopes?.length ? d.scopes.join(", ") : "(tidak ada scope)";
  const expiry = d.expires_at
    ? new Date(d.expires_at * 1000).toLocaleDateString("id-ID")
    : "tidak pernah (long-lived)";
  return {
    status: d.scopes?.length ? "pass" : "warn",
    message: `Token valid. Scopes: ${scopes}. Berlaku sampai: ${expiry}.`,
  };
}

/** Suite lengkap Meta (IG bisnis/IG Login/FB/Threads) — verify token dari DB kredensial masing-masing aplikasi, fallback env */
async function runMetaSuite(
  platform: VerifyTokenPlatform,
  socialAccountPlatform: string,
): Promise<TestResult[]> {
  const cred = await getCredential(platform);
  const userToken = await getStoredUserToken(socialAccountPlatform);

  return [
    await runCheck("Kredensial app tersimpan & format valid", () =>
      Promise.resolve(checkMetaCredentialFormat(cred)),
    ),
    await runCheck("App token valid (Graph /oauth/access_token_info)", () =>
      checkMetaAppToken(cred),
    ),
    await runCheck("Webhook verify token tersedia", () => checkVerifyToken(platform)),
    await runCheck("User token tersimpan — scopes & expiry (/debug_token)", () =>
      checkUserToken(userToken, cred),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Suite diagnostik YouTube & Google Business (Google OAuth — client sama)
// ---------------------------------------------------------------------------

async function runYouTubeSuite(): Promise<TestResult[]> {
  const cred = await getCredential("youtube");
  const account = await getStoredAccount("youtube");

  return [
    await runCheck("Kredensial Google OAuth tersimpan & format valid", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial Google belum tersimpan. Isi di Admin Panel → Kredensial Platform (atau env GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
        };
      }
      // Client ID Google: format {id}-{hash}.apps.googleusercontent.com
      if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(cred.clientId)) {
        return {
          status: "warn",
          message:
            "Client ID tidak sesuai format Google (*.apps.googleusercontent.com) — periksa Google Cloud Console.",
        };
      }
      const sourceLabel = cred.source === "db" ? "Admin Panel (DB)" : "env";
      return {
        status: "pass",
        message: `Kredensial valid (sumber: ${sourceLabel}). Client ID: ${cred.clientId.slice(0, 12)}…`,
      };
    }),
    await runCheck("Endpoint YouTube Data API hidup (googleapis.com)", async () => {
      // Ping tanpa API key — 400/403 berarti endpoint hidup
      const res = await fetchJson(`${YOUTUBE_API_URL}/channels?part=id`);
      if (res.status === 400 || res.status === 403) {
        return {
          status: "pass",
          message: `Endpoint merespons HTTP ${res.status} (key/auth diperlukan) — API YouTube hidup & terjangkau.`,
        };
      }
      return {
        status: "fail",
        message: `Endpoint tidak terjangkau (HTTP ${res.status}) — cek koneksi jaringan / firewall keluar.`,
      };
    }),
    await runCheck("User token tersimpan — refresh token & expiry", async () => {
      if (!account) {
        return {
          status: "warn",
          message:
            "Belum ada akun YouTube terhubung. Hubungkan minimal satu channel untuk memvalidasi token.",
        };
      }
      if (!account.refreshToken) {
        return {
          status: "fail",
          message:
            "Access token ada tapi refresh token kosong — connect ulang akun (access_type=offline wajib).",
        };
      }
      const expiry = account.tokenExpiresAt
        ? new Date(account.tokenExpiresAt).toLocaleString("id-ID")
        : "tidak diketahui";
      return {
        status: "pass",
        message: `Token tersimpan + refresh token ada. Access token berlaku sampai: ${expiry}.`,
      };
    }),
    await runCheck("User token valid — panggil /channels (mine)", async () => {
      if (!account?.accessToken) {
        return { status: "warn", message: "Dilewati — belum ada akun terhubung." };
      }
      const res = await fetchJson<{ items?: Array<{ snippet?: { title?: string } }> }>(
        `${YOUTUBE_API_URL}/channels?part=snippet&mine=true`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      if (res.ok && res.data?.items?.length) {
        return {
          status: "pass",
          message: `Token valid — channel: ${res.data.items[0]?.snippet?.title ?? "(tanpa nama)"}.`,
        };
      }
      if (res.status === 401) {
        return {
          status: "fail",
          message: "Token ditolak (401) — refresh gagal/terhapus; connect ulang akun YouTube.",
        };
      }
      if (res.status === 403) {
        return {
          status: "fail",
          message:
            "Token valid tapi 403 — project Google belum aktifkan YouTube Data API v3 di Cloud Console.",
        };
      }
      return {
        status: "fail",
        message: `Gagal memanggil /channels (HTTP ${res.status}): ${res.data?.toString().slice(0, 120) ?? ""}`,
      };
    }),
  ];
}

async function runGoogleBusinessSuite(): Promise<TestResult[]> {
  const cred = await getCredential("youtube");
  const account = await getStoredAccount("google_business");

  return [
    await runCheck("Kredensial Google OAuth tersimpan & format valid", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial Google belum tersimpan (share dengan YouTube). Isi GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.",
        };
      }
      if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(cred.clientId)) {
        return {
          status: "warn",
          message: "Client ID tidak sesuai format Google — periksa Google Cloud Console.",
        };
      }
      return { status: "pass", message: "Kredensial valid (client OAuth sama dengan YouTube)." };
    }),
    await runCheck("Endpoint Business Profile API hidup (googleapis.com)", async () => {
      const res = await fetchJson(`${GBP_ACCOUNT_API_URL}/accounts`);
      if (res.status === 401 || res.status === 403) {
        return {
          status: "pass",
          message: `Endpoint merespons HTTP ${res.status} (auth diperlukan) — API Business Profile hidup & terjangkau.`,
        };
      }
      if (res.status === 404) {
        return {
          status: "fail",
          message:
            "Endpoint 404 — API Business Profile Account Management belum diaktifkan di Google Cloud project.",
        };
      }
      return {
        status: "fail",
        message: `Endpoint tidak terjangkau (HTTP ${res.status}) — cek koneksi jaringan.`,
      };
    }),
    await runCheck("User token tersimpan — scope business.manage", async () => {
      if (!account) {
        return {
          status: "warn",
          message:
            "Belum ada akun Google Business terhubung. Hubungkan minimal satu akun untuk memvalidasi token.",
        };
      }
      if (!account.refreshToken) {
        return {
          status: "fail",
          message: "Refresh token kosong — connect ulang akun Google Business.",
        };
      }
      return { status: "pass", message: "Token + refresh token tersimpan." };
    }),
    await runCheck("User token valid — daftar akun GBP (accounts.list)", async () => {
      if (!account?.accessToken) {
        return { status: "warn", message: "Dilewati — belum ada akun terhubung." };
      }
      const res = await fetchJson<{ accounts?: Array<{ name?: string }> }>(
        `${GBP_ACCOUNT_API_URL}/accounts`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      if (res.ok) {
        const n = res.data?.accounts?.length ?? 0;
        return {
          status: n > 0 ? "pass" : "warn",
          message:
            n > 0
              ? `Token valid — ${n} akun GBP terjangkau.`
              : "Token valid tapi tidak ada akun GBP terdaftar (user belum jadi manager bisnis).",
        };
      }
      if (res.status === 403) {
        return {
          status: "fail",
          message:
            "Token ditolak (403) — scope business.manage hilang atau API belum diaktifkan; connect ulang akun.",
        };
      }
      return { status: "fail", message: `Gagal (HTTP ${res.status}) — periksa token akun.` };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Suite diagnostik Pinterest
// ---------------------------------------------------------------------------

async function runPinterestSuite(): Promise<TestResult[]> {
  const cred = await getCredential("pinterest");
  const account = await getStoredAccount("pinterest");

  return [
    await runCheck("Kredensial app tersimpan & format valid", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial Pinterest belum tersimpan. Isi di Admin Panel → Kredensial Platform (atau env PINTEREST_APP_ID/PINTEREST_APP_SECRET).",
        };
      }
      // App ID Pinterest numerik; secret 32 karakter
      if (!/^\d{8,20}$/.test(cred.clientId)) {
        return {
          status: "warn",
          message: "App ID terdeteksi bukan numerik standar Pinterest — periksa developer console.",
        };
      }
      const sourceLabel = cred.source === "db" ? "Admin Panel (DB)" : "env";
      return {
        status: "pass",
        message: `Kredensial valid (sumber: ${sourceLabel}, App ID ${cred.clientId.length} digit, secret ${cred.clientSecret.length} karakter).`,
      };
    }),
    await runCheck("Lingkungan API aktif (production vs sandbox)", async () => {
      const host = PINTEREST_API_BASE_URL.includes("api-sandbox")
        ? "api-sandbox.pinterest.com"
        : "api.pinterest.com";
      return {
        status: PINTEREST_SANDBOX ? "warn" : "pass",
        message: PINTEREST_SANDBOX
          ? `Menggunakan SANDBOX (${host}) — pin hanya tersimpan di lingkungan uji, bukan akun production. Token sandbox berlaku 30 hari.`
          : `Menggunakan production (${host}).`,
      };
    }),
    await runCheck("Endpoint Pinterest API hidup", async () => {
      // Ping /user_account tanpa token — 401 berarti hidup
      const res = await fetchJson(`${PINTEREST_API_BASE_URL}/user_account`);
      if (res.status === 401) {
        return {
          status: "pass",
          message:
            "Endpoint merespons HTTP 401 (auth diperlukan) — API Pinterest hidup & terjangkau.",
        };
      }
      return {
        status: "fail",
        message: `Endpoint tidak terjangkau (HTTP ${res.status}) — cek koneksi / nilai PINTEREST_API_BASE_URL.`,
      };
    }),
    await runCheck("User token valid — panggil /user_account", async () => {
      if (!account?.accessToken) {
        return {
          status: "warn",
          message:
            "Belum ada akun Pinterest terhubung. Hubungkan minimal satu akun untuk memvalidasi token.",
        };
      }
      const res = await fetchJson<{ username?: string; account_type?: string }>(
        `${PINTEREST_API_BASE_URL}/user_account`,
        { headers: { Authorization: `Bearer ${account.accessToken}` } },
      );
      if (res.ok && res.data?.username) {
        return {
          status: "pass",
          message: `Token valid — user @${res.data.username} (tipe ${res.data.account_type ?? "n/a"}).`,
        };
      }
      if (res.status === 401) {
        return {
          status: "fail",
          message:
            "Token ditolak (401) — token expired atau bukan untuk lingkungan API ini; connect ulang.",
        };
      }
      return { status: "fail", message: `Gagal (HTTP ${res.status}) — periksa token akun.` };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Suite diagnostik LinkedIn
// ---------------------------------------------------------------------------

async function runLinkedInSuite(): Promise<TestResult[]> {
  const cred = await getCredential("linkedin");
  const account = await getStoredAccount("linkedin");

  return [
    await runCheck("Kredensial app tersimpan & format valid", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial LinkedIn belum tersimpan. Isi di Admin Panel → Kredensial Platform (atau env LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET).",
        };
      }
      // Client ID LinkedIn: 77-78 karakter alfanumerik
      if (cred.clientId.length < 20) {
        return {
          status: "warn",
          message: "Client ID terlihat terlalu pendek — pastikan sesuai LinkedIn Developer Apps.",
        };
      }
      const sourceLabel = cred.source === "db" ? "Admin Panel (DB)" : "env";
      return {
        status: "pass",
        message: `Kredensial valid (sumber: ${sourceLabel}, Client ID ${cred.clientId.length} karakter).`,
      };
    }),
    await runCheck("Endpoint LinkedIn API hidup (api.linkedin.com)", async () => {
      // Ping userinfo tanpa token — 401/403 berarti endpoint hidup
      const res = await fetchJson(LINKEDIN_USERINFO_URL);
      if (res.status === 401 || res.status === 403) {
        return {
          status: "pass",
          message: `Endpoint merespons HTTP ${res.status} (auth diperlukan) — API LinkedIn hidup & terjangkau.`,
        };
      }
      return {
        status: "fail",
        message: `Endpoint tidak terjangkau (HTTP ${res.status}) — cek koneksi jaringan.`,
      };
    }),
    await runCheck("User token valid — OpenID userinfo (sub)", async () => {
      if (!account?.accessToken) {
        return {
          status: "warn",
          message:
            "Belum ada akun LinkedIn terhubung. Hubungkan minimal satu akun untuk memvalidasi token.",
        };
      }
      const res = await fetchJson<{ sub?: string; name?: string }>(LINKEDIN_USERINFO_URL, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      if (res.ok && res.data?.sub) {
        return {
          status: "pass",
          message: `Token valid — profil: ${res.data.name ?? res.data.sub}.`,
        };
      }
      if (res.status === 401) {
        return {
          status: "fail",
          message:
            "Token ditolak (401) — expired; refresh token LinkedIn 1x pakai perlu dijalankan ulang.",
        };
      }
      return { status: "fail", message: `Gagal (HTTP ${res.status}) — periksa token akun.` };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Suite diagnostik Bluesky
// ---------------------------------------------------------------------------

async function runBlueskySuite(): Promise<TestResult[]> {
  const account = await getStoredAccount("bluesky");

  return [
    await runCheck("AppView publik Bluesky hidup (public.api.bsky.app)", async () => {
      // Ping _health — endpoint health check publik AppView tanpa auth
      const res = await fetchJson<{ version?: string }>(`${BSKY_APPVIEW_URL}/_health`);
      if (res.ok) {
        return {
          status: "pass",
          message: `AppView publik merespons OK${res.data?.version ? ` (versi ${res.data.version.slice(0, 12)}…)` : ""} — jaringan ke Bluesky sehat.`,
        };
      }
      return {
        status: "fail",
        message: `AppView tidak terjangkau (HTTP ${res.status}) — cek koneksi jaringan keluar.`,
      };
    }),
    await runCheck("Session akun tersimpan (app password)", async () => {
      if (!account?.accessToken) {
        return {
          status: "warn",
          message:
            "Belum ada akun Bluesky terhubung. Hubungkan via app password (halaman Connect).",
        };
      }
      const isJwt = account.accessToken.startsWith("eyJ");
      return {
        status: "pass",
        message: isJwt
          ? "Access JWT tersimpan (session aktif)."
          : "App password tersimpan — session dibuat ulang saat publish.",
      };
    }),
    await runCheck("Akun valid — getProfile via AppView (DID)", async () => {
      if (!account) {
        return { status: "warn", message: "Dilewati — belum ada akun terhubung." };
      }
      // platformAccountId = DID; getProfile publik (tanpa auth) cukup validasi akun ada
      const res = await fetchJson<{ handle?: string; displayName?: string }>(
        `${BSKY_APPVIEW_URL}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(account.platformAccountId)}`,
      );
      if (res.ok && res.data?.handle) {
        return {
          status: "pass",
          message: `Akun aktif — @${res.data.handle} (${res.data.displayName ?? "tanpa nama"}).`,
        };
      }
      return {
        status: "fail",
        message: `Gagal mengambil profil (HTTP ${res.status}) — DID mungkin tidak valid.`,
      };
    }),
  ];
}

async function runTikTokSuite(): Promise<TestResult[]> {
  return [
    await runCheck("Kredensial app tersimpan & format valid", async () => {
      const cred = await getCredential("tiktok");
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial TikTok belum tersimpan. Isi di Admin Panel → Kredensial Platform (atau env TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET).",
        };
      }
      // client_key TikTok: alfanumerik ~24 karakter (bukan numerik seperti Meta)
      if (cred.clientId.length < 8) {
        return {
          status: "warn",
          message: "Client Key terlihat terlalu pendek — pastikan sesuai TikTok Developer Console.",
        };
      }
      const sourceLabel = cred.source === "db" ? "Admin Panel (DB)" : "env";
      return {
        status: "pass",
        message: `Kredensial valid, sumber: ${sourceLabel} (Client Key ${cred.clientId.length} karakter, secret ${cred.clientSecret.length} karakter).`,
      };
    }),
    await runCheck("Endpoint API TikTok hidup (open.tiktokapis.com)", async () => {
      // Ping tanpa token — 401 berarti endpoint hidup & auth enforcement jalan (itu OK)
      const res = await fetchJson(`${TIKTOK_OPEN_API_URL}/user/info/`);
      if (res.status === 401 || res.status === 403) {
        return {
          status: "pass",
          message: `Endpoint merespons HTTP ${res.status} (auth diperlukan) — API TikTok hidup & terjangkau.`,
        };
      }
      if (res.ok) {
        return {
          status: "warn",
          message:
            "Endpoint merespons 200 tanpa token — tidak terduga, periksa dokumentasi terbaru.",
        };
      }
      return {
        status: "fail",
        message: `Endpoint tidak terjangkau (HTTP ${res.status}) — cek koneksi jaringan / firewall keluar.`,
      };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /admin/api-tests — daftar test tersedia + hasil cache terakhir per platform */
apiTestsRoute.get("/", async (c) => {
  try {
    await requirePlatformAdmin(c);
    return c.json({
      platforms: AVAILABLE_PLATFORMS.map((platform) => ({
        platform,
        lastRun: lastResults.get(platform)?.ranAt ?? null,
        results: lastResults.get(platform)?.results ?? null,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /admin/api-tests/run/:platform — jalankan suite diagnostik */
apiTestsRoute.post("/run/:platform", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const platform = c.req.param("platform") as PlatformKey;

    if (!AVAILABLE_PLATFORMS.includes(platform)) {
      return c.json(
        { message: `Platform tidak didukung. Pilihan: ${AVAILABLE_PLATFORMS.join(", ")}` },
        400,
      );
    }

    let results: TestResult[];
    switch (platform) {
      case "tiktok":
        results = await runTikTokSuite();
        break;
      case "youtube":
        results = await runYouTubeSuite();
        break;
      case "google_business":
        results = await runGoogleBusinessSuite();
        break;
      case "pinterest":
        results = await runPinterestSuite();
        break;
      case "linkedin":
        results = await runLinkedInSuite();
        break;
      case "bluesky":
        results = await runBlueskySuite();
        break;
      case "threads":
        // Threads — app terpisah (verify token DB kartu Threads / env sendiri)
        results = await runMetaSuite("threads", "threads");
        break;
      case "instagram_standalone":
        // Instagram Login — aplikasi terpisah, verify token & secret app sendiri
        results = await runMetaSuite("instagram_standalone", "instagram_standalone");
        break;
      default:
        // Instagram & Facebook — satu aplikasi Meta
        results = await runMetaSuite(
          platform,
          // User token IG business disimpan di platform "instagram"
          "instagram",
        );
    }

    const ranAt = new Date().toISOString();
    lastResults.set(platform, { ranAt, results });

    // Audit: hanya ringkasan status — tidak ada secret/token
    logAdminAction(c, ctx.user.id, {
      action: "api_test.run",
      entityType: "platform",
      entityId: platform,
      metadata: {
        total: results.length,
        pass: results.filter((r) => r.status === "pass").length,
        warn: results.filter((r) => r.status === "warn").length,
        fail: results.filter((r) => r.status === "fail").length,
      },
    });

    return c.json({ platform, ranAt, results });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Trigger API calls for pending verification permissions
// ---------------------------------------------------------------------------

/**
 * POST /admin/api-tests/trigger/instagram-insights
 * Trigger 1 API call to instagram_business_manage_insights
 * Gets media list then fetches insights for first media
 */
apiTestsRoute.post("/trigger/instagram-insights", requirePlatformAdmin, async (c) => {
  try {
    const userToken = await getStoredUserToken("instagram");
    if (!userToken) {
      return c.json({ error: "No Instagram account connected" }, 400);
    }

    // Step 1: Get user's media list
    const mediaRes = await fetchJson<{
      data?: Array<{ id: string }>;
      error?: { message?: string };
    }>(
      `https://graph.facebook.com/v19.0/me/media?fields=id&limit=1&access_token=${encodeURIComponent(userToken)}`,
    );

    if (!mediaRes.ok || !mediaRes.data?.data?.length) {
      return c.json(
        {
          error: "Failed to get media list",
          details: mediaRes.data?.error?.message ?? "No media found",
        },
        400,
      );
    }

    const mediaId = mediaRes.data.data[0]?.id;

    // Step 2: Get insights for first media (triggers instagram_business_manage_insights)
    const insightsRes = await fetchJson<{
      data?: Array<{ name: string; values: Array<{ value: number }> }>;
      error?: { message?: string };
    }>(
      `https://graph.facebook.com/v19.0/${mediaId}/insights?metric=impressions,reach,engagement&access_token=${encodeURIComponent(userToken)}`,
    );

    if (!insightsRes.ok) {
      return c.json(
        {
          error: "Failed to get media insights",
          details: insightsRes.data?.error?.message ?? "Unknown error",
          mediaId,
        },
        400,
      );
    }

    return c.json({
      success: true,
      message: "instagram_business_manage_insights API call completed",
      mediaId,
      insights: insightsRes.data?.data,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/human-agent
 * Trigger Human Agent permission by sending a test message with human_agent flag
 */
apiTestsRoute.post("/trigger/human-agent", requirePlatformAdmin, async (c) => {
  try {
    const userToken = await getStoredUserToken("instagram");
    if (!userToken) {
      return c.json({ error: "No Instagram account connected" }, 400);
    }

    // Get user's IG business account ID
    const profileRes = await fetchJson<{
      id?: string;
      error?: { message?: string };
    }>(
      `https://graph.facebook.com/v19.0/me?fields=id&access_token=${encodeURIComponent(userToken)}`,
    );

    if (!profileRes.ok || !profileRes.data?.id) {
      return c.json(
        {
          error: "Failed to get Instagram account ID",
          details: profileRes.data?.error?.message,
        },
        400,
      );
    }

    const igUserId = profileRes.data.id;

    // Note: Human Agent requires an actual conversation with a user
    // This endpoint verifies the permission is available by checking scopes
    const debugRes = await fetchJson<{
      data?: {
        scopes?: string[];
        is_valid?: boolean;
      };
      error?: { message?: string };
    }>(
      `https://graph.facebook.com/v19.0/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(userToken)}`,
    );

    const hasHumanAgent = debugRes.data?.data?.scopes?.includes("human_agent") ?? false;

    return c.json({
      success: true,
      message: "Human Agent permission check completed",
      igUserId,
      hasHumanAgentScope: hasHumanAgent,
      scopes: debugRes.data?.data?.scopes,
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

/**
 * POST /admin/api-tests/trigger/dm-permissions
 * Generate test API calls untuk Instagram (instagram_business_manage_messages)
 * dan Facebook (pages_messaging) DM permissions.
 *
 * Instagram butuh 10 test calls, Facebook butuh test calls ke conversations endpoint.
 */
apiTestsRoute.post("/trigger/dm-permissions", requirePlatformAdmin, async (c) => {
  try {
    const GRAPH_FB = GRAPH_FB_URL;
    const results: Array<{
      platform: string;
      account: string;
      calls: number;
      success: number;
      failed: number;
      errors: string[];
    }> = [];

    // --- Instagram DM test calls ---
    const igAccounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "instagram" as never))
      .limit(5);

    for (const account of igAccounts) {
      if (!account.accessTokenEnc) continue;

      let token: string;
      try {
        token = decrypt(account.accessTokenEnc);
      } catch {
        continue;
      }

      // Instagram via FB Login uses Page token for DM
      const pageToken =
        typeof account.metadata === "object" &&
        account.metadata !== null &&
        typeof (account.metadata as Record<string, unknown>).pageAccessToken === "string"
          ? ((account.metadata as Record<string, unknown>).pageAccessToken as string)
          : token;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetchJson<{
            data?: Array<{ id: string }>;
            error?: { message?: string };
          }>(
            `${GRAPH_FB}/${account.platformAccountId}/conversations?platform=instagram&fields=id,updated_time&limit=5&access_token=${encodeURIComponent(pageToken)}`,
          );
          if (res.ok) {
            success++;
          } else {
            failed++;
            if (res.data?.error?.message) {
              errors.push(res.data.error.message.slice(0, 100));
            }
          }
        } catch {
          failed++;
        }
      }

      results.push({
        platform: "instagram",
        account: account.username ?? account.platformAccountId,
        calls: 10,
        success,
        failed,
        errors: [...new Set(errors)].slice(0, 3),
      });
    }

    // --- Facebook DM test calls ---
    const fbAccounts = await db
      .select({
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        username: socialAccount.username,
      })
      .from(socialAccount)
      .where(eq(socialAccount.platform, "facebook" as never))
      .limit(5);

    for (const account of fbAccounts) {
      if (!account.accessTokenEnc) continue;

      let token: string;
      try {
        token = decrypt(account.accessTokenEnc);
      } catch {
        continue;
      }

      // Facebook uses Page token for DM
      const pageToken =
        typeof account.metadata === "object" &&
        account.metadata !== null &&
        typeof (account.metadata as Record<string, unknown>).pageAccessToken === "string"
          ? ((account.metadata as Record<string, unknown>).pageAccessToken as string)
          : token;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetchJson<{
            data?: Array<{ id: string }>;
            error?: { message?: string };
          }>(
            `${GRAPH_FB}/${account.platformAccountId}/conversations?fields=id,updated_time&limit=5&access_token=${encodeURIComponent(pageToken)}`,
          );
          if (res.ok) {
            success++;
          } else {
            failed++;
            if (res.data?.error?.message) {
              errors.push(res.data.error.message.slice(0, 100));
            }
          }
        } catch {
          failed++;
        }
      }

      results.push({
        platform: "facebook",
        account: account.username ?? account.platformAccountId,
        calls: 10,
        success,
        failed,
        errors: [...new Set(errors)].slice(0, 3),
      });
    }

    await logAdminAction(c, null, {
      action: "dm_permissions.trigger",
      entityType: "social_account",
      metadata: {
        results: results.map((r) => ({
          platform: r.platform,
          success: r.success,
          failed: r.failed,
        })),
      },
    });

    return c.json({
      success: true,
      message: "DM permission test calls completed",
      results,
      nextSteps: [
        "Buka Meta Developer Console → App Review → Permissions and Features",
        "Cek 'panggilan API uji' sudah bertambah untuk instagram_business_manage_messages dan pages_messaging",
        "Jika semua test calls berhasil (success=10), submit untuk review",
      ],
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
