// Account API (Standard+) — list, detail, statistik, count, remove.
// Docs: docs/repliz/Account/

import { replizEmpty, replizRequest, type ReplizCredentials } from "./shared";

/** Akun sosial di workspace Repliz (GET /public/account) */
export type ReplizAccount = {
  id: string;
  generatedId: string;
  name: string;
  username: string;
  picture?: string;
  isConnected: boolean;
  type: string;
};

/** Page Facebook hasil get-page (berisi page access token) */
export type ReplizPage = {
  id: string;
  name: string;
  username?: string;
  picture?: string;
  token: string;
};

/** Channel YouTube hasil get-channel (berisi channel token) */
export type ReplizChannel = ReplizPage; // bentuk sama: id, name, username, picture, token

/** Organization LinkedIn hasil get-organization (berisi org token) */
export type ReplizOrganization = ReplizPage; // id (urn:li:organization:*), name, username, picture, token

/** List akun terkoneksi di workspace Repliz (paginated) */
export async function replizListAccounts(
  cred: ReplizCredentials,
  opts: { page?: number; limit?: number; type?: string; search?: string } = {},
): Promise<{
  docs: ReplizAccount[];
  totalDocs: number;
  hasNextPage: boolean;
  nextPage: number | null;
}> {
  return replizRequest(cred, "/public/account", {
    query: {
      page: String(opts.page ?? 1),
      limit: String(opts.limit ?? 20),
      ...(opts.type ? { types: opts.type } : {}),
      ...(opts.search ? { search: opts.search } : {}),
    },
  });
}

/** Detail satu akun Repliz — sumber kebenaran isConnected untuk health akun bridge */
export async function replizGetAccount(
  cred: ReplizCredentials,
  accountId: string,
): Promise<ReplizAccount> {
  return replizRequest(cred, `/public/account/${accountId}`);
}

/**
 * Statistik agregat per akun (GET /public/account/{id}/statistic).
 * Penting: {id} adalah internal Repliz ObjectId 24-char (`_id`/`id` di doc
 * akun, disimpan kita di `metadata.replizAccountId`) — BUKAN `generatedId`
 * (id platform, mis. `UC…` YouTube atau `urn:li:organization:…` LinkedIn).
 * Diverifikasi live: generatedId ditolak (400 "must be a 24 character hex").
 * Diverifikasi live 21 Sep 2026: berfungsi utk instagram/threads/tiktok;
 * facebook & youtube (akun page/channel kita) → 404 "account not found"
 * (keterbatasan platform, bukan bug). Panggilan wajib graceful 404.
 */
export async function replizGetAccountStatistic(
  cred: ReplizCredentials,
  accountId: string,
): Promise<Record<string, number>> {
  return replizRequest(cred, `/public/account/${accountId}/statistic`);
}

/** Jumlah akun per platform + batas paket (GET /public/account/count). */
export async function replizCountAccounts(
  cred: ReplizCredentials,
): Promise<{ total: number; limit: number; perPlatform: Record<string, number> }> {
  const data = await replizRequest<Record<string, unknown>>(cred, "/public/account/count");
  const perPlatform: Record<string, number> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (k === "total" || k === "limit") continue;
    if (typeof v === "number") perPlatform[k] = v;
  }
  return {
    total: Number(data?.total ?? 0),
    limit: Number(data?.limit ?? 0),
    perPlatform,
  };
}

/** Hapus akun dari workspace Repliz (DELETE /public/account/{accountId}, 204) */
export async function replizRemoveAccount(
  cred: ReplizCredentials,
  accountId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/account/${accountId}`, { method: "DELETE" });
}
