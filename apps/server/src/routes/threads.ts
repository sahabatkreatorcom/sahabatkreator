// API Threads advanced access — riset keyword, lokasi, profil publik, mention,
// dan hapus post. Semua endpoint org-scoped; token di-decrypt di sini (tidak
// pernah dikirim ke client). Fitur backend: packages/publishing/src/threads-advanced.ts.

import { db } from "@sahabatkreator/db";
import { post, socialAccount } from "@sahabatkreator/db/schema";
import {
  deleteThreadsPost,
  getThreadsMentions,
  getThreadsProfilePosts,
  lookupThreadsProfile,
  PublishError,
  searchThreadsKeywords,
  searchThreadsLocations,
} from "@sahabatkreator/publishing";
import { cancelPublishJob } from "@sahabatkreator/queue";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, HTTPError, requireOrg } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";

export const threadsRoute = new Hono();

/**
 * Bungkus error: `PublishError` dari Threads API dipetakan ke 502 dengan pesan
 * asli Graph (mengandung status + body) agar bisa ditampilkan di UI, bukan 500
 * generik "Terjadi kesalahan internal".
 */
function fail(error: unknown): Response {
  if (error instanceof PublishError) {
    console.warn("[threads] upstream error:", error.message);
    return errorResponse(new HTTPError(502, error.message));
  }
  return errorResponse(error);
}

/** Ambil akun Threads milik org + token siap pakai (atau lempar 400/404) */
async function getThreadsAccount(accountId: string, organizationId: string) {
  const [account] = await db
    .select({
      id: socialAccount.id,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      username: socialAccount.username,
      accessTokenEnc: socialAccount.accessTokenEnc,
      isConnected: socialAccount.isConnected,
    })
    .from(socialAccount)
    .where(and(eq(socialAccount.id, accountId), eq(socialAccount.organizationId, organizationId)))
    .limit(1);

  if (!account) throw new HTTPError(404, "Akun tidak ditemukan");
  if (account.platform !== "threads") {
    throw new HTTPError(400, "Akun bukan Threads");
  }
  if (!account.isConnected || !account.accessTokenEnc) {
    throw new HTTPError(400, "Akun Threads belum terhubung — hubungkan ulang");
  }

  let accessToken: string;
  try {
    accessToken = decrypt(account.accessTokenEnc);
  } catch {
    throw new HTTPError(400, "Token Threads tidak bisa dibaca — hubungkan ulang");
  }
  return { ...account, accessToken };
}

/** GET /threads/accounts — daftar akun Threads org (untuk picker) */
threadsRoute.get("/accounts", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accounts = await db
      .select({
        id: socialAccount.id,
        username: socialAccount.username,
        displayName: socialAccount.displayName,
        avatarUrl: socialAccount.avatarUrl,
      })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.organizationId, ctx.organization.id),
          eq(socialAccount.platform, "threads" as never),
          eq(socialAccount.isConnected, true),
        ),
      );
    return c.json({ accounts });
  } catch (error) {
    return fail(error);
  }
});

/** GET /threads/search?accountId=&q=&searchType=TOP|RECENT — keyword search */
threadsRoute.get("/search", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accountId = c.req.query("accountId");
    const q = c.req.query("q")?.trim();
    if (!accountId || !q) {
      throw new HTTPError(400, "Parameter accountId & q wajib diisi");
    }
    const searchType = c.req.query("searchType") === "RECENT" ? "RECENT" : "TOP";
    const account = await getThreadsAccount(accountId, ctx.organization.id);
    const posts = await searchThreadsKeywords({
      accessToken: account.accessToken,
      query: q,
      searchType,
      limit: 25,
    });
    return c.json({ posts });
  } catch (error) {
    return fail(error);
  }
});

/** GET /threads/locations?accountId=&q= — cari lokasi (untuk tag/publish) */
threadsRoute.get("/locations", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accountId = c.req.query("accountId");
    const q = c.req.query("q")?.trim();
    if (!accountId || !q) {
      throw new HTTPError(400, "Parameter accountId & q wajib diisi");
    }
    const account = await getThreadsAccount(accountId, ctx.organization.id);
    const locations = await searchThreadsLocations({
      accessToken: account.accessToken,
      query: q,
      limit: 25,
    });
    return c.json({ locations });
  } catch (error) {
    return fail(error);
  }
});

/**
 * GET /threads/discover?accountId=&username= — profil publik + post-nya.
 * Threads hanya mendukung lookup **username persis** (bukan keyword).
 * `GET /profile_lookup` + `GET /profile_posts` — scope threads_profile_discovery.
 */
threadsRoute.get("/discover", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accountId = c.req.query("accountId");
    const username = (c.req.query("username") ?? c.req.query("q"))?.trim();
    if (!accountId || !username) {
      throw new HTTPError(400, "Parameter accountId & username wajib diisi");
    }
    const account = await getThreadsAccount(accountId, ctx.organization.id);
    const profile = await lookupThreadsProfile({
      accessToken: account.accessToken,
      username,
    });
    // Post profil best-effort — profil tetap tampil walau daftar post gagal.
    let posts: Awaited<ReturnType<typeof getThreadsProfilePosts>> = [];
    if (profile) {
      try {
        posts = await getThreadsProfilePosts({
          accessToken: account.accessToken,
          username,
          limit: 25,
        });
      } catch (error) {
        console.warn("[threads] profile posts error:", (error as Error).message);
      }
    }
    return c.json({ profile, posts });
  } catch (error) {
    return fail(error);
  }
});

/** GET /threads/mentions?accountId= — sebutan akun kita di post orang lain */
threadsRoute.get("/mentions", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const accountId = c.req.query("accountId");
    if (!accountId) {
      throw new HTTPError(400, "Parameter accountId wajib diisi");
    }
    const account = await getThreadsAccount(accountId, ctx.organization.id);
    const mentions = await getThreadsMentions({
      accessToken: account.accessToken,
      userId: account.platformAccountId,
      limit: 25,
    });
    return c.json({ mentions });
  } catch (error) {
    return fail(error);
  }
});

/**
 * DELETE /threads/posts/:postId — hapus post Threads yang sudah tayang.
 * Menghapus di Graph (scope threads_delete) lalu menghapus row post lokal.
 */
threadsRoute.delete("/posts/:postId", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const postId = c.req.param("postId");

    const [row] = await db
      .select({
        id: post.id,
        platform: post.platform,
        platformPostId: post.platformPostId,
        socialAccountId: post.socialAccountId,
      })
      .from(post)
      .where(and(eq(post.id, postId), eq(post.organizationId, ctx.organization.id)))
      .limit(1);

    if (!row) throw new HTTPError(404, "Post tidak ditemukan");
    if (row.platform !== "threads") {
      throw new HTTPError(400, "Post bukan dari Threads");
    }
    if (!row.platformPostId || !row.socialAccountId) {
      throw new HTTPError(400, "Post belum tayang / tanpa ID platform");
    }

    const account = await getThreadsAccount(row.socialAccountId, ctx.organization.id);
    await deleteThreadsPost({
      accessToken: account.accessToken,
      mediaId: row.platformPostId,
    });

    await cancelPublishJob(row.id, row.platform);
    await db.delete(post).where(eq(post.id, row.id));
    return c.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
});
