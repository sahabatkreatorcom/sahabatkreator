// Suite diagnostik Meta (IG bisnis / IG Login / FB / Threads) — verify token,
// app token, dan debug_token user. Dipanggil dari admin-api-tests.ts.

import { db } from "@sahabatkreator/db";
import { platformCredential } from "@sahabatkreator/db/schema";
import { GRAPH_FB_URL, GRAPH_IG_URL, refreshDueTokens } from "@sahabatkreator/publishing";
import { and, eq } from "drizzle-orm";
import { decrypt } from "../lib/crypto";
import { getCredential, runCheck, type TestResult } from "./admin-api-test-core";
import { fetchJson, getStoredUserToken } from "./admin-api-test-shared";

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

/** Check (b): app token valid — mint via client_credentials lalu, bila didukung, inspect token. */
async function checkMetaAppToken(
  cred: { clientId: string; clientSecret: string; source: "db" | "env" } | null,
  graphUrl = GRAPH_FB_URL,
  inspectToken = true,
): Promise<Omit<TestResult, "name" | "durationMs">> {
  if (!cred) {
    return { status: "fail", message: "Dilewati — kredensial app belum tersimpan." };
  }
  // Mint app access token dulu — /oauth/access_token_info hanya menerima
  // param access_token (client_id+client_secret langsung akan ditolak 400).
  const mintUrl =
    `${graphUrl}/oauth/access_token` +
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

  // Threads Graph can mint a valid app token but returns HTTP 400 for the
  // Facebook Graph-only /oauth/access_token_info inspection endpoint.
  if (!inspectToken) {
    return {
      status: "pass",
      message: "App token valid — Threads Graph menerima client_id + client_secret.",
    };
  }

  const infoUrl = `${graphUrl}/oauth/access_token_info?access_token=${encodeURIComponent(appToken)}`;
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
  graphUrl = GRAPH_FB_URL,
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
    `${graphUrl}/oauth/access_token` +
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
    `${graphUrl}/debug_token` +
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

/** Validate an Instagram Login token directly; this flow has no Meta app token. */
async function checkInstagramStandaloneUserToken(
  userToken: string | null,
): Promise<Omit<TestResult, "name" | "durationMs">> {
  if (!userToken) {
    return {
      status: "warn",
      message: "Belum ada user token tersimpan (belum ada akun Instagram standalone terhubung).",
    };
  }

  const url = `${GRAPH_IG_URL}/me?fields=id,username&access_token=${encodeURIComponent(userToken)}`;
  const res = await fetchJson<{ id?: string; username?: string; error?: { message?: string } }>(
    url,
  );
  if (!res.ok || !res.data?.id) {
    return {
      status: "fail",
      message: `Token Instagram tidak valid / tidak bisa diperiksa: ${res.data?.error?.message ?? `HTTP ${res.status}`}`,
    };
  }
  return {
    status: "pass",
    message: `Token Instagram valid — akun @${res.data.username ?? res.data.id}.`,
  };
}

/** Suite lengkap Meta (IG bisnis/IG Login/FB/Threads) — verify token dari DB kredensial masing-masing aplikasi, fallback env */
export async function runMetaSuite(
  platform: VerifyTokenPlatform,
  socialAccountPlatform: string,
  graphUrl = GRAPH_FB_URL,
): Promise<TestResult[]> {
  const cred = await getCredential(platform);
  if (platform === "instagram_standalone") {
    // Refresh the long-lived token before validating /me. The worker normally
    // does this hourly, but an admin test should not race that schedule.
    await refreshDueTokens(20);
  }
  const userToken = await getStoredUserToken(socialAccountPlatform);

  return [
    await runCheck("Kredensial app tersimpan & format valid", () =>
      Promise.resolve(checkMetaCredentialFormat(cred)),
    ),
    await runCheck(
      platform === "threads"
        ? "App token valid (Threads Graph /oauth/access_token)"
        : platform === "instagram_standalone"
          ? "App token tidak diperlukan (Instagram Login)"
          : "App token valid (Graph /oauth/access_token_info)",
      () =>
        platform === "instagram_standalone"
          ? Promise.resolve({
              status: "pass" as const,
              message: "Instagram Login tidak memakai App Token Graph client_credentials.",
            })
          : checkMetaAppToken(cred, graphUrl, platform !== "threads"),
    ),
    await runCheck("Webhook verify token tersedia", () => checkVerifyToken(platform)),
    await runCheck(
      platform === "instagram_standalone"
        ? "User token valid — panggil Graph Instagram /me"
        : "User token tersimpan — scopes & expiry (/debug_token)",
      () =>
        platform === "instagram_standalone"
          ? checkInstagramStandaloneUserToken(userToken)
          : checkUserToken(userToken, cred, graphUrl),
    ),
  ];
}
