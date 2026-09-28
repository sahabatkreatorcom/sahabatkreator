// Authorize URL builder + exchange/refresh token per platform.

import {
  GRAPH_IG_EXCHANGE_LONG_LIVED_URL,
  GRAPH_IG_REFRESH_URL,
  GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL,
  GRAPH_THREADS_REFRESH_URL,
} from "../config";
import { httpRequest } from "../http";
import { PublishError } from "../types";
import { OAUTH_CONFIGS } from "./platform-configs";
import { parseGrantedScopes, requestedScopes } from "./scopes";
import type { AppCredential, OAuthPlatform, TokenResult } from "./types";

/** Bangun URL authorize lengkap dengan state CSRF */
export function buildAuthorizeUrl(
  platform: OAuthPlatform,
  cred: AppCredential,
  state: string,
): string {
  const config = OAUTH_CONFIGS[platform];
  if (!config?.authorizeUrl) {
    throw new PublishError(
      "oauth_not_supported",
      `OAuth redirect ${platform} tidak didukung.`,
      false,
    );
  }
  const sep = config.scopeSeparator ?? " ";
  const params = new URLSearchParams({
    [config.clientIdParam ?? "client_id"]: cred.clientId,
    redirect_uri: cred.redirectUri,
    response_type: "code",
    scope: requestedScopes(platform, cred).join(sep),
    state,
    ...(config.extraAuthorizeParams ?? {}),
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

/** Exchange authorization code → token */
export async function exchangeCodeForToken(
  platform: OAuthPlatform,
  cred: AppCredential,
  code: string,
): Promise<TokenResult> {
  const config = OAUTH_CONFIGS[platform];
  if (!config) {
    throw new PublishError("oauth_not_supported", `OAuth ${platform} tidak didukung.`, false);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cred.redirectUri,
    [config.clientIdParam ?? "client_id"]: cred.clientId,
    client_secret: cred.clientSecret,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.basicAuth) {
    // Pinterest: HTTP Basic client_id:client_secret
    headers.Authorization = `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64")}`;
  }

  const res = await httpRequest<Record<string, any>>(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PublishError(
      "oauth_token_exchange_failed",
      `Exchange token ${platform} gagal (${res.status}): ${text.slice(0, 300)}`,
      false,
    );
  }

  const data = await res.json();
  let accessToken: string | undefined = data.access_token ?? data.data?.access_token; // TikTok: { data: { access_token } }
  if (!accessToken) {
    throw new PublishError(
      "oauth_no_token",
      `Response token ${platform} tidak berisi access_token`,
      false,
    );
  }

  let expiresIn = Number(data.expires_in ?? data.data?.expires_in);

  // Threads: token exchange awal hanya short-lived (~24 jam) — langsung upgrade
  // ke long-lived 60 hari via grant_type=th_exchange_token (docs threads.md).
  // Tanpa ini token mati dalam sehari dan refresh scheduler tidak sempat jalan.
  if (platform === "threads") {
    const longLived = await httpRequest<{ access_token?: string; expires_in?: number }>(
      GRAPH_THREADS_EXCHANGE_LONG_LIVED_URL,
      {
        query: {
          grant_type: "th_exchange_token",
          client_secret: cred.clientSecret,
          access_token: accessToken,
        },
      },
    );
    if (longLived.ok) {
      const ld = await longLived.json();
      if (ld.access_token) {
        accessToken = ld.access_token;
        if (ld.expires_in) expiresIn = ld.expires_in; // ~5184000 (60 hari)
      }
    }
    // Gagal upgrade (mis. token private-profile) → lanjut dengan short-lived;
    // refresh scheduler akan coba lagi dan menandai needsReconnect bila gagal.
  }

  // Instagram standalone (IG Login): token exchange awal hanya short-lived (~1 jam) —
  // langsung upgrade ke long-lived 60 hari via grant_type=ig_exchange_token.
  // Tanpa ini token expired dalam 1 jam setelah connect.
  if (platform === "instagram_standalone") {
    const longLived = await httpRequest<{ access_token?: string; expires_in?: number }>(
      GRAPH_IG_EXCHANGE_LONG_LIVED_URL,
      {
        query: {
          grant_type: "ig_exchange_token",
          client_secret: cred.clientSecret,
          access_token: accessToken,
        },
      },
    );
    if (longLived.ok) {
      const ld = await longLived.json();
      if (ld.access_token) {
        accessToken = ld.access_token;
        if (ld.expires_in) expiresIn = ld.expires_in; // ~5184000 (60 hari)
      }
    }
    // Gagal upgrade → lanjut dengan short-lived; refresh scheduler menandai needsReconnect.
  }

  return {
    accessToken,
    // Threads & instagram_standalone: token long-lived juga dipakai untuk refresh berikutnya —
    // simpan sebagai refreshToken supaya scheduler jalan.
    refreshToken:
      platform === "threads" || platform === "instagram_standalone"
        ? accessToken
        : (data.refresh_token ?? data.data?.refresh_token ?? undefined),
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    // Pakai scope yang di-grant platform bila tersedia (LinkedIn mengirim field "scope";
    // dipakai fetchProfile untuk deteksi scope organization) — fallback ke yang diminta
    scopes: parseGrantedScopes(data) ?? requestedScopes(platform, cred),
  };
}

/** Refresh token (AT habis — Instagram/Threads, TikTok, Pinterest, Google, LinkedIn) */
export async function refreshAccessToken(
  platform: OAuthPlatform,
  cred: AppCredential,
  refreshToken: string,
): Promise<TokenResult> {
  const config = OAUTH_CONFIGS[platform];
  if (!config?.tokenUrl) {
    throw new PublishError("oauth_not_supported", `OAuth ${platform} tidak didukung.`, false);
  }

  // Threads: flow non-standar — refresh long-lived via GET refresh_access_token
  // dengan grant_type=th_refresh_token & param access_token (docs threads.md).
  // Token long-lived Threads TIDAK menghasilkan refresh_token terpisah.
  if (platform === "threads") {
    const res = await httpRequest<{ access_token?: string; expires_in?: number }>(
      GRAPH_THREADS_REFRESH_URL,
      {
        query: {
          grant_type: "th_refresh_token",
          access_token: refreshToken,
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PublishError(
        "oauth_refresh_failed",
        `Refresh token ${platform} gagal (${res.status}): ${text.slice(0, 200)} — hubungkan ulang akun.`,
        false,
      );
    }
    const data = await res.json();
    if (!data.access_token) {
      throw new PublishError(
        "oauth_no_token",
        `Refresh ${platform} tidak berisi access_token`,
        false,
      );
    }
    const expiresIn = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      // Token hasil refresh = AT sekaligus "refresh token" berikutnya
      refreshToken: data.access_token,
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
      scopes: requestedScopes(platform, cred),
    };
  }

  // Instagram Login: refresh long-lived user token via GRAPH_IG_REFRESH_URL.
  // The token endpoint used for authorization-code exchange does not accept
  // the generic OAuth refresh_token POST flow.
  if (platform === "instagram_standalone") {
    const res = await httpRequest<{ access_token?: string; expires_in?: number }>(
      GRAPH_IG_REFRESH_URL,
      {
        query: {
          grant_type: "ig_refresh_token",
          access_token: refreshToken,
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PublishError(
        "oauth_refresh_failed",
        `Refresh token ${platform} gagal (${res.status}): ${text.slice(0, 200)} — hubungkan ulang akun.`,
        false,
      );
    }
    const data = await res.json();
    if (!data.access_token) {
      throw new PublishError(
        "oauth_no_token",
        `Refresh ${platform} tidak berisi access_token`,
        false,
      );
    }
    const expiresIn = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      // Instagram refresh keeps the same long-lived token family.
      refreshToken: data.access_token,
      expiresAt:
        Number.isFinite(expiresIn) && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000)
          : null,
      scopes: requestedScopes(platform, cred),
    };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    [config.clientIdParam ?? "client_id"]: cred.clientId,
    client_secret: cred.clientSecret,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64")}`;
  }

  const res = await httpRequest<Record<string, any>>(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PublishError(
      "oauth_refresh_failed",
      `Refresh token ${platform} gagal (${res.status}): ${text.slice(0, 200)} — hubungkan ulang akun.`,
      false,
    );
  }

  const data = await res.json();
  const accessToken: string | undefined = data.access_token ?? data.data?.access_token;
  if (!accessToken) {
    throw new PublishError(
      "oauth_no_token",
      `Refresh ${platform} tidak berisi access_token`,
      false,
    );
  }
  const expiresIn = Number(data.expires_in ?? data.data?.expires_in);
  return {
    accessToken,
    // Pinterest RT rotating — RT baru harus dipersist; platform lain RT lama tetap valid
    refreshToken: data.refresh_token ?? data.data?.refresh_token ?? refreshToken,
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    scopes: parseGrantedScopes(data) ?? requestedScopes(platform, cred),
  };
}
