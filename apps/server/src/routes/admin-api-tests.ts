// API Admin API Tests — suite diagnostik Graph API / platform API
// Verifikasi konfigurasi SEBELUM pengajuan App Review (audit HIGH D1).
//
// Prinsip keamanan: hasil test TIDAK PERNAH berisi secret/token —
// hanya status (pass/fail/warn) + pesan + durasi.

import { db } from "@sahabatkreator/db";
import { platformCredential, socialAccount } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
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

type PlatformKey = "instagram" | "instagram_standalone" | "facebook" | "threads" | "tiktok";

/** Suite yang tersedia — key dipakai di URL POST /run/:platform */
const AVAILABLE_PLATFORMS: PlatformKey[] = [
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
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
const ENV_CREDENTIAL_KEYS: Record<PlatformKey, { id: string; secret: string }> = {
  // Instagram & Facebook — satu aplikasi Meta
  instagram: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  // Instagram Login — app terpisah, kredensial sendiri
  instagram_standalone: { id: "INSTAGRAM_APP_ID", secret: "INSTAGRAM_APP_SECRET" },
  facebook: { id: "META_APP_ID", secret: "META_APP_SECRET" },
  threads: { id: "THREADS_APP_ID", secret: "THREADS_APP_SECRET" },
  tiktok: { id: "TIKTOK_CLIENT_KEY", secret: "TIKTOK_CLIENT_SECRET" },
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

// ---------------------------------------------------------------------------
// Suite diagnostik Meta (Instagram / Facebook)
// ---------------------------------------------------------------------------

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

/** Check (b): app token valid via GET /oauth/access_token_info */
async function checkMetaAppToken(
  cred: { clientId: string; clientSecret: string; source: "db" | "env" } | null,
  graphHost: string,
): Promise<Omit<TestResult, "name" | "durationMs">> {
  if (!cred) {
    return { status: "fail", message: "Dilewati — kredensial app belum tersimpan." };
  }
  const url =
    `https://${graphHost}/${env.META_GRAPH_VERSION}/oauth/access_token_info` +
    `?client_id=${encodeURIComponent(cred.clientId)}&client_secret=${encodeURIComponent(cred.clientSecret)}`;
  const res = await fetchJson<{ error?: { message?: string } }>(url);

  if (res.ok) {
    return {
      status: "pass",
      message: `App token valid — Graph API menerima client_id + client_secret (HTTP ${res.status}).`,
    };
  }
  // 400 = invalid credential (OAuthException), 404 = versi API salah
  if (res.status === 400) {
    return {
      status: "fail",
      message:
        "Meta menolak kredensial (HTTP 400). App ID/Secret salah atau app sudah dihapus — cek developer console.",
    };
  }
  return {
    status: "fail",
    message: `Graph API merespons HTTP ${res.status} — periksa koneksi jaringan atau versi API (${env.META_GRAPH_VERSION}).`,
  };
}

/** Check (c): webhook verify token env terisi */
function checkVerifyTokenEnv(
  value: string | undefined,
  envKey: string,
): Omit<TestResult, "name" | "durationMs"> {
  if (value && value.length >= 8) {
    return {
      status: "pass",
      message: `${envKey} terisi — handshake webhook (hub.verify_token) siap dipakai.`,
    };
  }
  return {
    status: "fail",
    message: `${envKey} belum diisi (minimal 8 karakter) di .env root — webhook handshake GET akan selalu 403.`,
  };
}

/** Check (d): debug_token user token tersimpan — tampilkan scopes & expiry */
async function checkUserToken(
  userToken: string | null,
  cred: { clientId: string; clientSecret: string; source: "db" | "env" } | null,
  graphHost: string,
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

  // App access token diperlukan sebagai access_token param untuk debug_token
  const tokenUrl =
    `https://${graphHost}/${env.META_GRAPH_VERSION}/oauth/access_token` +
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
    `https://${graphHost}/${env.META_GRAPH_VERSION}/debug_token` +
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

/** Suite lengkap Instagram/Facebook/Threads — graphHost & verify token env beda */
async function runMetaSuite(
  platform: PlatformKey,
  graphHost: string,
  verifyTokenEnv: string | undefined,
  verifyTokenKey: string,
  socialAccountPlatform: string,
): Promise<TestResult[]> {
  const cred = await getCredential(platform);
  const userToken = await getStoredUserToken(socialAccountPlatform);

  return [
    await runCheck("Kredensial app tersimpan & format valid", () =>
      Promise.resolve(checkMetaCredentialFormat(cred)),
    ),
    await runCheck("App token valid (Graph /oauth/access_token_info)", () =>
      checkMetaAppToken(cred, graphHost),
    ),
    await runCheck("Webhook verify token env terisi", () =>
      Promise.resolve(checkVerifyTokenEnv(verifyTokenEnv, verifyTokenKey)),
    ),
    await runCheck("User token tersimpan — scopes & expiry (/debug_token)", () =>
      checkUserToken(userToken, cred, graphHost),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Suite diagnostik TikTok
// ---------------------------------------------------------------------------

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
      const res = await fetchJson("https://open.tiktokapis.com/v2/user/info/");
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
    if (platform === "tiktok") {
      results = await runTikTokSuite();
    } else if (platform === "threads") {
      // Threads — Graph host sendiri + verify token env sendiri (app terpisah)
      results = await runMetaSuite(
        "threads",
        "graph.threads.net",
        env.THREADS_WEBHOOK_VERIFY_TOKEN ?? env.META_WEBHOOK_VERIFY_TOKEN,
        "THREADS_WEBHOOK_VERIFY_TOKEN",
        "threads",
      );
    } else if (platform === "instagram_standalone") {
      // Instagram Login — Graph host sendiri (graph.instagram.com) +
      // verify token & secret app sendiri (terpisah dari aplikasi Meta)
      results = await runMetaSuite(
        "instagram_standalone",
        "graph.instagram.com",
        env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
        "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
        "instagram_standalone",
      );
    } else {
      // Instagram & Facebook — satu aplikasi Meta, graph host sama
      results = await runMetaSuite(
        platform,
        "graph.facebook.com",
        env.META_WEBHOOK_VERIFY_TOKEN,
        "META_WEBHOOK_VERIFY_TOKEN",
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
