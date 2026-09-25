// Pipeline publishing — state machine post + claim atomik + daily limit
// Dijalankan dari 2 tempat: server (publish now inline) dan apps/worker (cron fallback).
// Keamanan double-publish: claim via UPDATE ... WHERE status='scheduled' RETURNING (atomic).

import { db, notifyOrganization, pushToOrganization } from "@sahabatkreator/db";
import {
  media as mediaTable,
  post,
  postGroup,
  postMedia,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, gt, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import { getAdapter } from "./adapters";
import { decrypt } from "./crypto";
import { sendReply } from "./reply";
import { PLATFORM_DAILY_LIMITS, PublishError, supportsFirstComment, type PublishInput } from "./types";

/** Decrypt token akun — helper terpusat pipeline */
function decryptToken(enc: string | null): string | null {
  if (!enc) return null;
  try {
    return decrypt(enc);
  } catch (error) {
    console.error("[publishing] decrypt token gagal:", error);
    return null;
  }
}

/** Load post lengkap (group + akun + media) untuk dipublish */
async function loadPostForPublish(postId: string) {
  const [row] = await db
    .select({
      post: {
        id: post.id,
        postGroupId: post.postGroupId,
        socialAccountId: post.socialAccountId,
        platform: post.platform,
        content: post.content,
        hashtags: post.hashtags,
        firstComment: post.firstComment,
        platformSettings: post.platformSettings,
        platformPostId: post.platformPostId,
        platformPostUrl: post.platformPostUrl,
      },
      groupContent: postGroup.content,
      scheduledAt: postGroup.scheduledAt,
      account: {
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        refreshTokenEnc: socialAccount.refreshTokenEnc,
        username: socialAccount.username,
        metadata: socialAccount.metadata,
      },
    })
    .from(post)
    .innerJoin(postGroup, eq(post.postGroupId, postGroup.id))
    .innerJoin(socialAccount, eq(post.socialAccountId, socialAccount.id))
    .where(eq(post.id, postId))
    .limit(1);
  return row ?? null;
}

/**
 * Kirim komentar pertama (first comment) ke platform setelah post tayang.
 * Best-effort: kegagalan komentar TIDAK menggagalkan post (hanya log).
 * Platform yang didukung dilihat dari FIRST_COMMENT_PLATFORMS; platform tanpa
 * API create-comment (TikTok/Pinterest) maupun LinkedIn personal (app hanya
 * punya w_member_social → socialActions butuh w_member_social_feed, lihat
 * types.ts) di-skip diam-diam agar tidak menimbulkan error 403 yang menyesatkan.
 */
async function sendFirstComment(
  platform: string,
  platformPostId: string,
  content: string,
  account: {
    platformAccountId: string;
    accessTokenEnc: string | null;
    refreshTokenEnc: string | null;
    metadata: Record<string, unknown> | null;
  },
): Promise<void> {
  if (!supportsFirstComment(platform)) {
    // Bukan bug — keterbatasan API/scope platform. Pesan info, bukan error.
    console.info(
      `[publishing] First comment di-skip — ${platform} tidak mendukung komentar via API.`,
    );
    return;
  }
  const accessToken = decryptToken(account.accessTokenEnc);
  if (!accessToken) return;
  try {
    await sendReply({
      platform,
      accessToken,
      platformItemId: platformPostId,
      itemType: "first_comment", // YouTube: beda endpoint utk top-level comment vs reply
      content,
      platformAccountId: account.platformAccountId,
      accountMetadata: account.metadata,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[publishing] First comment post gagal (${platform}):`,
      errMsg,
      `\n  platformPostId: ${platformPostId}`,
      `\n  platformAccountId: ${account.platformAccountId}`,
    );
  }
}

/** Ambil media terlampir post (URL publik R2) urut sesuai compose */
async function loadPostMedia(postId: string) {
  return db
    .select({
      url: mediaTable.url,
      type: mediaTable.type,
      mimeType: mediaTable.mimeType,
      altText: mediaTable.altText,
      thumbnailUrl: mediaTable.thumbnailUrl,
    })
    .from(postMedia)
    .innerJoin(mediaTable, eq(postMedia.mediaId, mediaTable.id))
    .where(eq(postMedia.postId, postId))
    .orderBy(postMedia.sortOrder);
}

/** Hitung publish 24 jam terakhir per akun → tolak bila melebihi limit aman platform */
async function enforceDailyLimit(socialAccountId: string, platform: string): Promise<void> {
  const limit = PLATFORM_DAILY_LIMITS[platform] ?? 50;
  if (limit <= 0) {
    throw new PublishError("platform_manual", "Platform ini hanya untuk pencatatan manual.", false);
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Hitung published/publishing dalam window 24 jam (attempted)
  const [window] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(post)
    .where(
      and(
        eq(post.socialAccountId, socialAccountId),
        inArray(post.status, ["published", "publishing"]),
        sql`${post.updatedAt} >= ${since}`,
      ),
    );
  const used = window?.total ?? 0;
  if (used >= limit) {
    throw new PublishError(
      "daily_limit_reached",
      `Batas publish ${platform} tercapai (${limit}/24 jam). Coba lagi nanti.`,
      false,
    );
  }
}

/** Baca kredensial bridge Repliz aktif (null bila tidak dikonfigurasi) */
async function loadBridgeCredentials(): Promise<{ accessKey: string; secretKey: string } | null> {
  const { bridgeConfig } = await import("@sahabatkreator/db/schema");
  const [row] = await db
    .select()
    .from(bridgeConfig)
    .where(and(eq(bridgeConfig.provider, "repliz"), eq(bridgeConfig.isActive, true)))
    .limit(1);
  if (!row) return null;
  const { decrypt } = await import("./crypto");
  try {
    return { accessKey: row.accessKey, secretKey: decrypt(row.secretEnc) };
  } catch {
    return null;
  }
}

/** Bangun PublishInput dari row DB */
async function buildPublishInput(postId: string): Promise<{
  input: PublishInput;
  platform: string;
  scheduledAt: Date | null;
  /** "repliz" bila akun ini publish via bridge */
  adapterPlatform: string;
} | null> {
  const row = await loadPostForPublish(postId);
  if (!row) return null;

  const media = await loadPostMedia(postId);
  const content = row.post.content ?? row.groupContent;

  // Akun bridge Repliz: publish via Schedule API (routing per-account, metadata.replizAccountId)
  const replizAccountId = row.account.metadata?.replizAccountId as string | undefined;
  if (replizAccountId) {
    const cred = await loadBridgeCredentials();
    if (!cred) {
      throw new PublishError(
        "bridge_not_configured",
        `Akun @${row.account.username} terhubung via bridge, tapi bridge belum dikonfigurasi admin.`,
        false,
      );
    }
    return {
      platform: row.post.platform,
      scheduledAt: row.scheduledAt,
      adapterPlatform: "repliz",
      input: {
        // Kredensial Repliz diangkut via accessToken (format basic:<base64>) — lihat adapter repliz
        accessToken: `basic:${Buffer.from(`${cred.accessKey}:${cred.secretKey}`).toString("base64")}`,
        refreshToken: null,
        platformAccountId: replizAccountId,
        content,
        hashtags: row.post.hashtags ?? [],
        media,
        platformSettings: {
          ...(row.post.platformSettings ?? {}),
          scheduledAt: row.scheduledAt?.toISOString(),
          replizTargetPlatform: row.post.platform, // adapter tahu platform asli
        },
      },
    };
  }

  const accessToken = decryptToken(row.account.accessTokenEnc);
  if (!accessToken) {
    throw new PublishError(
      "token_missing",
      `Akun @${row.account.username} belum terhubung (token tidak tersedia). Hubungkan ulang akun.`,
      false,
    );
  }
  const refreshToken = decryptToken(row.account.refreshTokenEnc);

  return {
    platform: row.post.platform,
    scheduledAt: row.scheduledAt,
    adapterPlatform: row.post.platform,
    input: {
      accessToken,
      refreshToken,
      platformAccountId: row.account.platformAccountId,
      content,
      hashtags: row.post.hashtags ?? [],
      media,
      platformSettings: {
        ...(row.post.platformSettings ?? {}),
        scheduledAt: row.scheduledAt?.toISOString(),
      },
    },
  };
}

/** Simpan handle async (publish_id TikTok / container IG) — dipakai worker poll */
async function saveAsyncHandle(postId: string, handle: string): Promise<void> {
  await db
    .update(post)
    .set({
      status: "publishing",
      platformPostId: handle, // handle poll; platformPostUrl final diisi saat complete
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(post.id, postId));
}

/** Selesaikan post dengan hasil published */
async function markPublished(
  postId: string,
  platformPostId: string,
  url?: string | null,
): Promise<void> {
  await db
    .update(post)
    .set({
      status: "published",
      platformPostId,
      platformPostUrl: url ?? null,
      publishedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(post.id, postId));
  void notifyPostEvent(postId, "post_published", "Post berhasil tayang", url ?? undefined);
}

/** Tandai failed (dengan retryable utk keputusan worker) */
async function markFailed(postId: string, code: string, message: string): Promise<void> {
  await db
    .update(post)
    .set({ status: "failed", errorCode: code, errorMessage: message.slice(0, 500) })
    .where(eq(post.id, postId));
  void notifyPostEvent(
    postId,
    "post_failed",
    "Post gagal tayang",
    undefined,
    message.slice(0, 300),
  );
}

/** Notifikasi event post (best-effort — jangan blok pipeline) */
async function notifyPostEvent(
  postId: string,
  type: "post_published" | "post_failed",
  title: string,
  url?: string,
  detail?: string,
): Promise<void> {
  try {
    const [row] = await db
      .select({
        organizationId: post.organizationId,
        platform: post.platform,
        content: post.content,
        postGroupId: post.postGroupId,
      })
      .from(post)
      .where(eq(post.id, postId))
      .limit(1);
    if (!row) return;
    const preview = (row.content ?? "").slice(0, 80);
    const body =
      type === "post_failed"
        ? `${row.platform}: ${preview}${detail ? ` — ${detail}` : ""}`
        : `${row.platform}: ${preview}`;
    // Landing push: failed → halaman retry, published → halaman konfirmasi.
    // postGroupId dipakai karena action retry/publish beroperasi pada post group.
    const landingUrl =
      type === "post_failed"
        ? `/post-failed?groupId=${row.postGroupId}`
        : (url ?? `/publish-ready?groupId=${row.postGroupId}`);
    await notifyOrganization({
      organizationId: row.organizationId,
      type,
      title,
      body,
      linkUrl: landingUrl,
      roles: ["owner", "admin", "editor"],
    });
    // Web push ke device user (best-effort, hormati preferensi per user)
    await pushToOrganization(
      row.organizationId,
      type,
      {
        title,
        body,
        url: landingUrl,
        tag: `${type}-${postId}`,
      },
      ["owner", "admin", "editor"],
    );
  } catch {
    // best-effort
  }
}

/** Persist token hasil rotasi (Pinterest/TikTok rotating RT) */
async function persistRotatedTokens(
  postId: string,
  tokens: { accessToken?: string; refreshToken?: string },
): Promise<void> {
  // Enkripsi dilakukan caller-side (server lib crypto) — publishing package punya crypto.ts sendiri
  const { encrypt } = await import("./crypto");
  const [row] = await db
    .select({ socialAccountId: post.socialAccountId })
    .from(post)
    .where(eq(post.id, postId))
    .limit(1);
  if (!row) return;
  await db
    .update(socialAccount)
    .set({
      ...(tokens.accessToken ? { accessTokenEnc: encrypt(tokens.accessToken) } : {}),
      ...(tokens.refreshToken ? { refreshTokenEnc: encrypt(tokens.refreshToken) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(socialAccount.id, row.socialAccountId));
}

/**
 * Execute publish satu post — dibuat untuk processor queue (BullMQ).
 * PERBEDAAN dengan publishPost: error retryable DI-THROW (BullMQ retry backoff),
 * error permanen di-return. Caller (processor) memutuskan.
 */
export async function executePublish(
  postId: string,
): Promise<"published" | "processing" | "failed" | "retryable_error"> {
  let built: Awaited<ReturnType<typeof buildPublishInput>> = null;
  try {
    built = await buildPublishInput(postId);
    if (!built) return "failed";

    // Baca ulang row post (firstComment + socialAccountId untuk limit & first comment)
    const row = await loadPostForPublish(postId);
    if (!row) return "failed";
    await enforceDailyLimit(row.post.socialAccountId, built.platform);
    const adapter = getAdapter(built.adapterPlatform);
    if (!adapter) {
      await markFailed(
        postId,
        "no_adapter",
        `Adapter platform ${built.adapterPlatform} belum tersedia.`,
      );
      return "failed";
    }

    const result = await adapter.publish(built.input);

    if (result.status === "published") {
      await markPublished(postId, result.platformPostId, result.platformPostUrl);
      if (result.rotatedTokens) await persistRotatedTokens(postId, result.rotatedTokens);
      // First comment — best-effort setelah post tayang
      const firstComment = row.post.firstComment?.trim();
      if (firstComment) {
        await sendFirstComment(built.platform, result.platformPostId, firstComment, row.account);
      }
      return "published";
    }

    // processing (async) — simpan handle untuk polling worker
    await saveAsyncHandle(postId, result.handle);
    if (result.rotatedTokens) await persistRotatedTokens(postId, result.rotatedTokens);
    return "processing";
  } catch (error) {
    if (error instanceof PublishError) {
      if (error.retryable) {
        // Jangan tandai failed — throw utk retry BullMQ (attempt tracking di job).
        // Reset status ke "scheduled" agar claim ulang berikutnya valid.
        throw error;
      }
      await markFailed(postId, error.code, error.message);
      return "failed";
    }
    console.error(`[publishing] Post ${postId} gagal:`, error);
    throw new PublishError(
      "unknown_error",
      error instanceof Error ? error.message : "Kesalahan tidak diketahui",
      true,
    );
  }
}

/**
 * Publish satu post (sudah diclaim oleh caller) — mode DB fallback tanpa retry throw.
 * Menangani 3 hasil: published / processing (async) / error.
 */
export async function publishPost(postId: string): Promise<"published" | "processing" | "failed"> {
  try {
    const result = await executePublish(postId);
    return result === "retryable_error" ? "failed" : result;
  } catch (error) {
    // Mode fallback: retryable error → tandai failed (worker DB tidak punya backoff engine)
    const message = error instanceof PublishError ? error.message : "Kesalahan tidak diketahui";
    const code = error instanceof PublishError ? error.code : "unknown_error";
    await markFailed(postId, code, message);
    return "failed";
  }
}

/**
 * Claim SATU post by id — atomik (untuk processor queue job-based).
 * Return false bila post sudah diclaim runner lain / status tidak valid.
 */
export async function claimPostById(postId: string): Promise<boolean> {
  const claimed = await db
    .update(post)
    .set({ status: "publishing" })
    .where(and(eq(post.id, postId), inArray(post.status, ["scheduled", "draft"])))
    .returning({ id: post.id });
  return claimed.length > 0;
}

/** Reset post publishing → scheduled (dipakai saat job dibatalkan / retryable error) */
export async function resetToScheduled(postId: string): Promise<void> {
  await db
    .update(post)
    .set({ status: "scheduled" })
    .where(and(eq(post.id, postId), eq(post.status, "publishing")))
    .catch(() => undefined);
}

/**
 * Claim post terjadwal yang jatuh tempo — ATOMIK.
 * UPDATE ... WHERE status='scheduled' AND scheduledAt <= now RETURNING →
 * hanya satu runner (server inline / worker fallback) yang dapat post ini.
 */
export async function claimDuePosts(limit = 10): Promise<string[]> {
  const now = new Date();
  // Drizzle update tidak punya .limit() — pakai subquery id yang jatuh tempo lalu update by id
  const duePosts = await db.execute(
    sql`select p.id from post p
        join post_group g on g.id = p.post_group_id
        where p.status = 'scheduled' and g.scheduled_at is not null and g.scheduled_at <= ${now}
        limit ${limit}
        for update skip locked`,
  );
  const ids = (duePosts.rows as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];

  const claimed = await db
    .update(post)
    .set({ status: "publishing" })
    .where(and(eq(post.status, "scheduled"), inArray(post.id, ids)))
    .returning({ id: post.id });
  return claimed.map((r) => r.id);
}

/**
 * Poll SATU post in-flight (untuk job poll BullMQ).
 * Return status akhir post.
 */
export async function pollPost(postId: string): Promise<"published" | "failed" | "processing"> {
  const [row] = await db
    .select({
      platform: post.platform,
      handle: post.platformPostId,
      socialAccountId: post.socialAccountId,
      content: post.content,
      hashtags: post.hashtags,
      firstComment: post.firstComment,
      platformSettings: post.platformSettings,
    })
    .from(post)
    .where(and(eq(post.id, postId), eq(post.status, "publishing")))
    .limit(1);
  // Post sudah selesai (published/failed) oleh runner lain — hentikan chain poll,
  // jangan re-enqueue job berikutnya (poll job lama bisa masih di queue saat
  // recovery sweep / race dengan job poll sebelumnya).
  if (!row) {
    const [done] = await db
      .select({ status: post.status })
      .from(post)
      .where(eq(post.id, postId))
      .limit(1);
    return done?.status === "failed" ? "failed" : "published";
  }
  if (!row.handle) return "processing";

  const [account] = await db
    .select({
      accessTokenEnc: socialAccount.accessTokenEnc,
      refreshTokenEnc: socialAccount.refreshTokenEnc,
      platformAccountId: socialAccount.platformAccountId,
      username: socialAccount.username,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(eq(socialAccount.id, row.socialAccountId))
    .limit(1);

  // Akun bridge: kredensial Repliz + replizAccountId untuk polling schedule
  const replizAccountId = account?.metadata?.replizAccountId as string | undefined;
  if (replizAccountId) {
    const status = await pollReplizSchedule(postId, row.handle, replizAccountId, row.firstComment);
    return status;
  }

  const adapter = getAdapter(row.platform);
  if (!adapter?.checkStatus) return "processing";

  if (!account) {
    await markFailed(postId, "account_missing", "Akun sosial post tidak ditemukan saat polling.");
    return "failed";
  }
  const accessToken = decryptToken(account.accessTokenEnc);
  if (!accessToken) {
    await markFailed(postId, "token_missing", "Token akun tidak tersedia saat polling.");
    return "failed";
  }

  let status: Awaited<ReturnType<NonNullable<typeof adapter.checkStatus>>>;
  try {
    status = await adapter.checkStatus({
      accessToken,
      platformAccountId: account.platformAccountId,
      handle: row.handle,
      accountHandle: account.username,
      content: row.content ?? undefined,
      hashtags: row.hashtags as string[] | undefined,
      platformSettings: (row.platformSettings as Record<string, unknown>) ?? undefined,
      media: await loadPostMedia(postId),
    });
  } catch (error) {
    // Error permanen dari platform (mis. container EXPIRED, token invalid) →
    // tandai failed langsung; jangan buang attempt retry utk error non-retryable.
    if (error instanceof PublishError && !error.retryable) {
      await markFailed(postId, error.code, error.message);
      return "failed";
    }
    throw error; // transien → job poll di-retry BullMQ / next tick fallback
  }
  if (status.status === "published") {
    await markPublished(postId, status.platformPostId, status.platformPostUrl);
    // First comment — best-effort setelah post tayang (jalur async/poll)
    const firstComment = row.firstComment?.trim();
    if (firstComment) {
      await sendFirstComment(row.platform, status.platformPostId, firstComment, account);
    }
    return "published";
  }
  if (status.status === "failed") {
    await markFailed(postId, status.code, status.message);
    return "failed";
  }
  return "processing";
}

/**
 * Poll satu schedule Repliz (akun bridge) — return status akhir post.
 * Saat sukses: ambil URL post dari Content API (response schedule hanya berisi
 * postId, tidak ada URL) lalu kirim first comment via Create Comment API
 * (token platform disimpan Repliz — bukan kita, jadi tidak bisa pakai sendReply
 * native).
 */
async function pollReplizSchedule(
  postId: string,
  scheduleId: string,
  replizAccountId: string,
  firstComment?: string | null,
): Promise<"published" | "failed" | "processing"> {
  const cred = await loadBridgeCredentials();
  if (!cred) {
    await markFailed(postId, "bridge_not_configured", "Bridge Repliz tidak dikonfigurasi.");
    return "failed";
  }
  const { replizCreateComment, replizGetContent, replizGetSchedule } = await import("./repliz");
  const sched = await replizGetSchedule(cred, scheduleId, replizAccountId);
  if (!sched) return "processing";
  if (sched.status === "success") {
    // Ambil permalink dari Content API by-id (schedule response tidak menyertakan
    // URL, hanya postId). Sebelumnya memindai halaman pertama GET /public/content
    // — post di luar halaman pertama tidak ketemu. Best-effort: kegagalan tidak
    // menggagalkan publish; URL tetap bisa diisi posts-sync saat import external.
    let postUrl: string | null = null;
    if (sched.postId) {
      try {
        const content = await replizGetContent(cred, sched.postId, replizAccountId);
        postUrl = content?.url ?? null;
      } catch (error) {
        console.warn(
          `[publishing] Ambil URL post bridge gagal (${postId}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    await markPublished(postId, sched.postId ?? scheduleId, postUrl);

    // First comment untuk akun bridge: kirim lewat Repliz Create Comment API
    // (POST /public/content/{contentId}/comment) karena token platform asli
    // tidak ada di sisi kita. Repliz menyimpan token platform, sehingga
    // komentarnya berfungsi untuk SEMUA platform yang didukungnya (termasuk
    // TikTok & LinkedIn personal yang native-nya terbatas scope) — gate-nya
    // bukan supportsFirstComment (itu untuk jalur native) melainkan apakah
    // platform ini dikelola Repliz (sudah pasti, karena akunnya bridge).
    const fc = firstComment?.trim();
    if (fc && sched.postId) {
      try {
        await replizCreateComment(cred, sched.postId, replizAccountId, fc);
      } catch (error) {
        // Best-effort — post sudah tayang, kegagalan komentar tidak fatal
        console.error(
          `[publishing] First comment bridge gagal (${postId}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }
    return "published";
  }
  if (sched.status === "error") {
    await markFailed(postId, "repliz_schedule_error", "Publish via bridge Repliz gagal.");
    return "failed";
  }
  return "processing";
}

/**
 * Poll semua post berstatus "publishing" dengan handle async (TikTok publish_id, IG container, Pinterest media).
 * Dipanggil worker berkala (mode fallback DB).
 */
export async function pollInFlightPosts(
  limit = 20,
): Promise<{ published: number; failed: number; processing: number }> {
  const inFlight = await db
    .select({
      id: post.id,
      platform: post.platform,
      handle: post.platformPostId,
      socialAccountId: post.socialAccountId,
      content: post.content,
      hashtags: post.hashtags,
      firstComment: post.firstComment,
      platformSettings: post.platformSettings,
    })
    .from(post)
    .where(and(eq(post.status, "publishing"), isNotNull(post.platformPostId)))
    .limit(limit);

  let published = 0;
  let failed = 0;
  let processing = 0;

  for (const row of inFlight) {
    try {
      const [account] = await db
        .select({
          accessTokenEnc: socialAccount.accessTokenEnc,
          refreshTokenEnc: socialAccount.refreshTokenEnc,
          platformAccountId: socialAccount.platformAccountId,
          username: socialAccount.username,
          metadata: socialAccount.metadata,
        })
        .from(socialAccount)
        .where(eq(socialAccount.id, row.socialAccountId))
        .limit(1);

      // Akun bridge: poll schedule Repliz
      const replizAccountId = account?.metadata?.replizAccountId as string | undefined;
      if (replizAccountId) {
        if (!row.handle) {
          processing++;
          continue;
        }
        const status = await pollReplizSchedule(
          row.id,
          row.handle,
          replizAccountId,
          row.firstComment,
        );
        if (status === "published") published++;
        else if (status === "failed") failed++;
        else processing++;
        continue;
      }

      const adapter = getAdapter(row.platform);
      if (!adapter?.checkStatus || !row.handle || !account) {
        processing++;
        continue;
      }
      // Ambil token akun
      const accessToken = decryptToken(account.accessTokenEnc);
      if (!accessToken) {
        await markFailed(row.id, "token_missing", "Token akun tidak tersedia saat polling.");
        failed++;
        continue;
      }

      const status = await adapter.checkStatus({
        accessToken,
        platformAccountId: account.platformAccountId,
        handle: row.handle,
        accountHandle: account.username,
        content: row.content ?? undefined,
        hashtags: row.hashtags as string[] | undefined,
        platformSettings: (row.platformSettings as Record<string, unknown>) ?? undefined,
        media: await loadPostMedia(row.id),
      });

      if (status.status === "published") {
        await markPublished(row.id, status.platformPostId, status.platformPostUrl);
        // First comment — best-effort setelah post tayang (jalur worker fallback)
        const firstComment = row.firstComment?.trim();
        if (firstComment) {
          await sendFirstComment(row.platform, status.platformPostId, firstComment, account);
        }
        published++;
      } else if (status.status === "failed") {
        await markFailed(row.id, status.code, status.message);
        failed++;
      } else {
        processing++;
      }
    } catch (error) {
      // Polling error tidak fatal — biarkan worker coba lagi next tick
      console.error(
        `[publishing] Poll ${row.id} error:`,
        error instanceof Error ? error.message : error,
      );
      processing++;
    }
  }
  return { published, failed, processing };
}

/**
 * Recovery: post stuck "publishing" terlalu lama (> 30 menit tanpa penyelesaian)
 * → tandai failed agar tidak menggantung selamanya (retry manual oleh user).
 * Handle async TikTok/IG kadang tidak pernah complete → fail-safe.
 */
export async function recoverStalePosts(): Promise<number> {
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
  const stale = await db
    .update(post)
    .set({
      status: "failed",
      errorCode: "stale_timeout",
      errorMessage: "Publish timeout (30 menit tanpa konfirmasi platform). Silakan coba lagi.",
    })
    .where(and(eq(post.status, "publishing"), sql`${post.updatedAt} < ${staleBefore}`))
    .returning({ id: post.id });
  return stale.length;
}

/** Signature daftar antrian backfill terakhir — untuk log sekali, bukan tiap tick */
let lastBackfillSignature = "";

/**
 * Outcome backfill terakhir per post — dipakai untuk log hanya saat berubah,
 * supaya terlihat apa yang TikTok balikkan tanpa spam tiap 60 detik.
 */
const lastBackfillOutcome = new Map<string, string>();

/**
 * Backfill id + link post TikTok yang belum tersedia saat publish.
 * TikTok tidak mengembalikan publicly_available_post_id & share_url sampai post
 * public dan lolos moderasi (client belum audit → bisa tertunda beberapa menit/jam).
 * Karena publish_id disimpan sebagai platform_postId, kita bisa status/fetch ulang
 * untuk mengambil video id + share_url asli begitu tersedia.
 */
export async function backfillTikTokPostUrls(limit = 10): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: post.id,
      platformPostId: post.platformPostId,
      socialAccountId: post.socialAccountId,
    })
    .from(post)
    .where(
      and(
        eq(post.platform, "tiktok"),
        eq(post.status, "published"),
        isNull(post.platformPostUrl),
        // platform_post_id masih berupa publish_id (mengandung "~"), bukan video id
        like(post.platformPostId, "%~%"),
        gt(post.publishedAt, since),
      ),
    )
    .orderBy(desc(post.publishedAt))
    .limit(limit);

  // Log sekali saat daftar antrian berubah — supaya terlihat job jalan tanpa spam.
  const signature = rows.map((r) => r.id).join(",");
  if (signature !== lastBackfillSignature) {
    lastBackfillSignature = signature;
    console.log(
      rows.length > 0
        ? `[publishing] Backfill URL TikTok: ${rows.length} post menunggu link dari TikTok`
        : `[publishing] Backfill URL TikTok: antrian kosong`,
    );
  }

  if (rows.length === 0) return 0;

  const adapter = getAdapter("tiktok");
  if (!adapter?.checkStatus) return 0;

  let backfilled = 0;
  for (const row of rows) {
    try {
      if (!row.platformPostId || !row.socialAccountId) continue;
      const [account] = await db
        .select({
          accessTokenEnc: socialAccount.accessTokenEnc,
          platformAccountId: socialAccount.platformAccountId,
          username: socialAccount.username,
        })
        .from(socialAccount)
        .where(eq(socialAccount.id, row.socialAccountId))
        .limit(1);
      const accessToken = decryptToken(account?.accessTokenEnc ?? null);
      if (!accessToken || !account) continue;

      const status = await adapter.checkStatus({
        accessToken,
        platformAccountId: account.platformAccountId,
        handle: row.platformPostId,
        accountHandle: account.username,
      });

      if (status.status !== "published") {
        // Gagal / masih diproses — log sekali saja, jangan tiap siklus.
        const outcome = status.status === "failed" ? `failed:${status.code}` : "processing";
        if (lastBackfillOutcome.get(row.id) !== outcome) {
          lastBackfillOutcome.set(row.id, outcome);
          console.log(
            `[publishing] Backfill TikTok ${row.id}: ${status.status}` +
              (status.status === "failed"
                ? ` ${status.code}${status.message ? ` — ${String(status.message).slice(0, 140)}` : ""}`
                : ""),
          );
        }
        continue;
      }

      const url = status.platformPostUrl ?? null;
      const hasNewId = Boolean(status.platformPostId) && status.platformPostId !== row.platformPostId;
      if (!url && !hasNewId) {
        const outcome = "published|no-url|same-id";
        if (lastBackfillOutcome.get(row.id) !== outcome) {
          lastBackfillOutcome.set(row.id, outcome);
          console.log(
            `[publishing] Backfill TikTok ${row.id}: PUBLISH_COMPLETE tapi share_url kosong dan ` +
              `publicaly_available_post_id belum ada (post belum public / belum lolos moderasi)`,
          );
        }
        continue;
      }

      await db
        .update(post)
        .set({
          ...(hasNewId ? { platformPostId: status.platformPostId } : {}),
          ...(url ? { platformPostUrl: url } : {}),
        })
        .where(eq(post.id, row.id));
      if (url) {
        backfilled++;
        console.log(`[publishing] Backfill URL TikTok ${row.id} → ${url}`);
      }
    } catch (error) {
      console.error(
        `[publishing] Backfill URL TikTok ${row.id} gagal:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return backfilled;
}

/**
 * Entry point worker fallback: satu siklus penuh.
 * return ringkasan untuk logging.
 */
export async function runPublishCycle(): Promise<{
  claimed: number;
  published: number;
  processing: number;
  failed: number;
  polled: { published: number; failed: number; processing: number };
  recovered: number;
  backfilled: number;
}> {
  const postIds = await claimDuePosts(10);

  let published = 0;
  let processing = 0;
  let failed = 0;
  for (const id of postIds) {
    const result = await publishPost(id);
    if (result === "published") published++;
    else if (result === "processing") processing++;
    else failed++;
  }

  const polled = await pollInFlightPosts(20);
  const recovered = await recoverStalePosts();
  const backfilled = await backfillTikTokPostUrls(10);

  return {
    claimed: postIds.length,
    published,
    processing,
    failed,
    polled,
    recovered,
    backfilled,
  };
}
