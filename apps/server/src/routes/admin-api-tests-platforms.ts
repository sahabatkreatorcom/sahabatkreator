// Suite diagnostik platform non-Meta (YouTube, Google Business, Pinterest,
// LinkedIn, LinkedIn Org, Bluesky, TikTok). Dipanggil dari admin-api-tests.ts.

import {
  BSKY_APPVIEW_URL,
  GBP_ACCOUNT_API_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_REST_URL,
  LINKEDIN_USERINFO_URL,
  listGbpAccounts,
  PINTEREST_API_BASE_URL,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "@sahabatkreator/publishing";
import { getCredential, getStoredAccount, runCheck, type TestResult } from "./admin-api-test-core";
import { fetchJson } from "./admin-api-test-shared";

// ---------------------------------------------------------------------------
// Suite diagnostik YouTube & Google Business (Google OAuth — client sama)
// ---------------------------------------------------------------------------

export async function runYouTubeSuite(): Promise<TestResult[]> {
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

export async function runGoogleBusinessSuite(): Promise<TestResult[]> {
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
      // listGbpAccounts: cached 5 menit → hindari burst call yang memicu 429
      try {
        const accounts = await listGbpAccounts(account.accessToken);
        return {
          status: accounts.length > 0 ? "pass" : "warn",
          message:
            accounts.length > 0
              ? `Token valid — ${accounts.length} akun GBP terjangkau.`
              : "Token valid tapi tidak ada akun GBP terdaftar (user belum jadi manager bisnis).",
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("(429)")) {
          return {
            status: "warn",
            message:
              "Kuota per-menit Business Profile API habis (429). Ajukan peningkatan kuota di Google Cloud → APIs & Services → Quotas, lalu coba lagi beberapa menit.",
          };
        }
        if (message.includes("(403)")) {
          return {
            status: "fail",
            message:
              "Akses ditolak (403). Cek 3 hal: (1) scope business.manage belum di-approve, (2) akses Business Profile API project belum di-allowlist (pengajuan terpisah dari verifikasi OAuth), (3) API belum diaktifkan di Google Cloud. Setelah beres, connect ulang akun.",
          };
        }
        return { status: "fail", message };
      }
    }),
  ];
}

export async function runPinterestSuite(): Promise<TestResult[]> {
  const cred = await getCredential("pinterest");
  const account = await getStoredAccount("pinterest");

  return [
    await runCheck("Kredensial Pinterest tersimpan", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial Pinterest belum tersimpan. Isi di Admin Panel atau env PINTEREST_APP_ID/PINTEREST_APP_SECRET.",
        };
      }
      return {
        status: /^\d{8,20}$/.test(cred.clientId) ? "pass" : "warn",
        message: /^\d{8,20}$/.test(cred.clientId)
          ? "Kredensial Pinterest valid."
          : "App ID Pinterest terlihat tidak standar — periksa Developer Console.",
      };
    }),
    await runCheck("Endpoint Pinterest API hidup", async () => {
      const res = await fetchJson(`${PINTEREST_API_BASE_URL}/user_account`);
      return res.status === 401
        ? { status: "pass", message: "Endpoint Pinterest hidup (auth diperlukan)." }
        : { status: "fail", message: `Endpoint tidak terjangkau (HTTP ${res.status}).` };
    }),
    await runCheck("User token valid — panggil /user_account", async () => {
      if (!account?.accessToken) {
        return { status: "warn", message: "Belum ada akun Pinterest terhubung." };
      }
      const res = await fetchJson<{ username?: string }>(`${PINTEREST_API_BASE_URL}/user_account`, {
        headers: { Authorization: `Bearer ${account.accessToken}` },
      });
      if (res.ok && res.data?.username) {
        return { status: "pass", message: `Token valid — @${res.data.username}.` };
      }
      return {
        status: "fail",
        message:
          res.status === 401
            ? "Token ditolak (401) — hubungkan ulang Pinterest."
            : `Gagal (HTTP ${res.status}).`,
      };
    }),
  ];
}

export async function runLinkedInSuite(): Promise<TestResult[]> {
  const cred = await getCredential("linkedin");
  const account = await getStoredAccount("linkedin");

  return [
    await runCheck("Kredensial app tersimpan & format valid", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial LinkedIn belum tersimpan. Isi di Admin Panel atau env LINKEDIN_CLIENT_ID/LINKEDIN_CLIENT_SECRET.",
        };
      }
      return {
        status: cred.clientId.length >= 20 ? "pass" : "warn",
        message:
          cred.clientId.length >= 20
            ? "Kredensial LinkedIn valid."
            : "Client ID LinkedIn terlihat terlalu pendek — periksa Developer Apps.",
      };
    }),
    await runCheck("Endpoint LinkedIn API hidup", async () => {
      const res = await fetchJson(LINKEDIN_USERINFO_URL);
      return res.status === 401 || res.status === 403
        ? { status: "pass", message: `Endpoint hidup (HTTP ${res.status}, auth diperlukan).` }
        : { status: "fail", message: `Endpoint tidak terjangkau (HTTP ${res.status}).` };
    }),
    await runCheck("User token valid — OpenID userinfo", async () => {
      if (!account?.accessToken) {
        return { status: "warn", message: "Belum ada akun LinkedIn terhubung." };
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
      return {
        status: "fail",
        message:
          res.status === 401
            ? "Token ditolak (401) — hubungkan ulang LinkedIn."
            : `Gagal (HTTP ${res.status}).`,
      };
    }),
  ];
}

// Suite diagnostik LinkedIn company/page
export async function runLinkedInOrganizationSuite(): Promise<TestResult[]> {
  const cred = await getCredential("linkedin_org");
  const account = await getStoredAccount("linkedin_org");
  const headers = account?.accessToken
    ? {
        Authorization: `Bearer ${account.accessToken}`,
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      }
    : undefined;

  return [
    await runCheck("Kredensial app company tersimpan & format valid", async () => {
      if (!cred) {
        return {
          status: "fail",
          message:
            "Kredensial LinkedIn company belum tersimpan. Isi LINKEDIN_ORG_CLIENT_ID/LINKEDIN_ORG_CLIENT_SECRET di Admin Panel atau env.",
        };
      }
      if (cred.clientId.length < 20) {
        return {
          status: "warn",
          message:
            "Client ID company terlihat terlalu pendek — pastikan sesuai LinkedIn Developer Apps.",
        };
      }
      const sourceLabel = cred.source === "db" ? "Admin Panel (DB)" : "env";
      return {
        status: "pass",
        message: `Kredensial valid (sumber: ${sourceLabel}, Client ID ${cred.clientId.length} karakter).`,
      };
    }),
    await runCheck("Endpoint LinkedIn REST API hidup (api.linkedin.com)", async () => {
      const res = await fetchJson(`${LINKEDIN_REST_URL}/rest/organizationAcls`);
      if (res.status === 401 || res.status === 403) {
        return {
          status: "pass",
          message: `Endpoint merespons HTTP ${res.status} (auth diperlukan) — API LinkedIn company hidup & terjangkau.`,
        };
      }
      return {
        status: "fail",
        message: `Endpoint tidak terjangkau (HTTP ${res.status}) — cek koneksi jaringan.`,
      };
    }),
    await runCheck("User token valid — daftar company admin (organizationAcls)", async () => {
      if (!account?.accessToken || !headers) {
        return {
          status: "warn",
          message:
            "Belum ada halaman company LinkedIn terhubung. Hubungkan minimal satu company untuk memvalidasi token.",
        };
      }
      const res = await fetchJson<{
        elements?: Array<{
          organizationTarget?: string;
          organization?: string | { id?: number | string };
        }>;
      }>(
        `${LINKEDIN_REST_URL}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
        {
          headers,
        },
      );
      if (res.status === 401) {
        return {
          status: "fail",
          message: "Token LinkedIn company ditolak (401) — hubungkan ulang akun company.",
        };
      }
      if (res.status === 403) {
        return {
          status: "fail",
          message:
            "LinkedIn menolak akses company (403) — scope Community Management API belum approved atau user bukan ADMIN.",
        };
      }
      if (!res.ok) {
        return { status: "fail", message: `Gagal mengambil daftar company (HTTP ${res.status}).` };
      }
      const count = res.data?.elements?.length ?? 0;
      if (count === 0) {
        return {
          status: "warn",
          message: "Token valid, tetapi tidak ada company LinkedIn dengan peran ADMIN.",
        };
      }
      return {
        status: "pass",
        message: `Token valid — ${count} company dengan peran ADMIN ditemukan.`,
      };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Suite diagnostik Bluesky
// ---------------------------------------------------------------------------

export async function runBlueskySuite(): Promise<TestResult[]> {
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

export async function runTikTokSuite(): Promise<TestResult[]> {
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
