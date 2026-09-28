// Helper scope: gabung scope config + extra, dan parsing scope yang di-grant platform.

import { OAUTH_CONFIGS } from "./platform-configs";
import type { AppCredential, OAuthPlatform } from "./types";

/**
 * Scope ekstra dari kredensial app (cred.extra.extraScopes, dipisah spasi/koma).
 * Dipakai LinkedIn: scope organization ditambahkan admin SETELAH product LinkedIn
 * ter-approve (lihat env LINKEDIN_EXTRA_SCOPES) — default kosong agar consent tidak ditolak.
 */
export function parseExtraScopes(cred: AppCredential): string[] {
  const raw = cred.extra?.extraScopes;
  return typeof raw === "string" ? raw.split(/[\s,]+/).filter(Boolean) : [];
}

/** Daftar scope lengkap yang diminta (config + extra, tanpa duplikat, urut stabil) */
export function requestedScopes(platform: OAuthPlatform, cred: AppCredential): string[] {
  return [...new Set([...OAUTH_CONFIGS[platform].scopes, ...parseExtraScopes(cred)])];
}

/** Scope yang benar-benar di-grant platform (response token field "scope") — fallback ke requested */
export function parseGrantedScopes(data: Record<string, any>): string[] | undefined {
  const raw = typeof data.scope === "string" ? data.scope.trim() : "";
  if (!raw) return undefined;
  const granted = raw.split(/[\s,]+/).filter(Boolean);
  return granted.length > 0 ? granted : undefined;
}
