// Research API — pencarian Threads (user & konten publik).
// Docs: docs/repliz/Research/
//
// `accountId` WAJIB = id akun Threads terkoneksi di workspace Repliz (bisa
// bridge atau akun Threads lain yang valid). Dipakai untuk fitur riset konten.

import { replizRequest, type ReplizCredentials } from "./shared";

/** Hasil pencarian user Threads (GET /public/research/threads/user) */
export type ReplizThreadsUser = {
  name: string;
  username: string;
  picture?: string;
  isVerified?: boolean;
  statistic: {
    follower?: number;
    like?: number;
    quotes?: number;
    replies?: number;
    repost?: number;
    views?: number;
  };
};

/** Satu post Threads hasil pencarian konten */
export type ReplizThreadsContent = {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  owner?: { id?: string; name?: string; picture?: string };
  medias?: Array<{ url?: string; type?: string }>;
  createdAt?: string;
  statistic?: Record<string, number>;
};

/** Cari user Threads by username (GET /public/research/threads/user) */
export async function replizSearchThreadsUser(
  cred: ReplizCredentials,
  accountId: string,
  username: string,
): Promise<ReplizThreadsUser | null> {
  const data = await replizRequest<Record<string, unknown>>(
    cred,
    "/public/research/threads/user",
    { query: { accountId, username } },
  );
  if (!data?.username) return null;
  return data as unknown as ReplizThreadsUser;
}

/**
 * Cari konten publik Threads by keyword (GET /public/research/threads/content/search).
 * `since`/`until` = unix timestamp detik, HARUS keduanya.
 */
export async function replizSearchThreadsContent(
  cred: ReplizCredentials,
  accountId: string,
  opts: {
    search: string;
    sort?: "TOP" | "RECENT";
    mode?: "KEYWORD" | "TAG";
    type?: "TEXT" | "IMAGE" | "VIDEO";
    since?: number;
    until?: number;
    username?: string;
    nextToken?: string;
  },
): Promise<{ docs: ReplizThreadsContent[]; nextToken?: string }> {
  const query: Record<string, string> = { accountId, search: opts.search };
  if (opts.sort) query.sort = opts.sort;
  if (opts.mode) query.mode = opts.mode;
  if (opts.type) query.type = opts.type;
  if (opts.since !== undefined) query.since = String(opts.since);
  if (opts.until !== undefined) query.until = String(opts.until);
  if (opts.username) query.username = opts.username;
  if (opts.nextToken) query.nextToken = opts.nextToken;

  const data = await replizRequest<{
    docs?: Array<Record<string, unknown>>;
    nextToken?: string;
  }>(cred, "/public/research/threads/content/search", { query });

  return {
    docs: (data?.docs ?? []).map((d) => ({
      id: String(d.id ?? d._id),
      title: d.title ? String(d.title) : undefined,
      description: d.description ? String(d.description) : undefined,
      type: d.type ? String(d.type) : undefined,
      owner: d.owner as ReplizThreadsContent["owner"],
      medias: d.medias as ReplizThreadsContent["medias"],
      createdAt: d.createdAt ? String(d.createdAt) : undefined,
      statistic: d.statistic as Record<string, number> | undefined,
    })),
    nextToken: data?.nextToken,
  };
}

/** Ambil konten Threads dari user tertentu by username (GET /public/research/threads/content/user) */
export async function replizListThreadsUserContent(
  cred: ReplizCredentials,
  accountId: string,
  username: string,
  nextToken?: string,
): Promise<{ docs: ReplizThreadsContent[]; nextToken?: string }> {
  const query: Record<string, string> = { accountId, username };
  if (nextToken) query.nextToken = nextToken;

  const data = await replizRequest<{
    docs?: Array<Record<string, unknown>>;
    nextToken?: string;
  }>(cred, "/public/research/threads/content/user", { query });

  return {
    docs: (data?.docs ?? []).map((d) => ({
      id: String(d.id ?? d._id),
      title: d.title ? String(d.title) : undefined,
      description: d.description ? String(d.description) : undefined,
      type: d.type ? String(d.type) : undefined,
      owner: d.owner as ReplizThreadsContent["owner"],
      medias: d.medias as ReplizThreadsContent["medias"],
      createdAt: d.createdAt ? String(d.createdAt) : undefined,
      statistic: d.statistic as Record<string, number> | undefined,
    })),
    nextToken: data?.nextToken,
  };
}
