// Orchestration posts-sync — import konten terbit langsung dari platform ke DB
// agar kalender menampilkan konten lengkap (yang dipublikasikan di luar Sahabat Kreator).
//
// 3 lapis dedupe:
// 1. In-memory by externalId (media & stories platform bisa overlap)
// 2. Match ke post native via platformPostId → backfill kolom external (bukan insert baru)
// 3. Unique constraint (organizationId, externalId) di DB — fallback create → update
//
// Dipanggil worker (loop 4 jam) dan route POST /api/posts/sync (manual).

import { db } from "@sahabatkreator/db";
import { post, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { decrypt } from "./crypto";
import {
  type ExternalPost,
  GRAPH_IG,
  getFacebookPagePosts,
  getFacebookPageStories,
  getInstagramMedia,
  getInstagramStories,
  getPinterestPins,
  getTikTokVideos,
  getYouTubeVideos,
} from "./posts-sync-api";

/** Platform yang didukung posts-sync (punya API list konten terbit). */
export const POSTS_SYNC_PLATFORMS = new Set<string>([
  "instagram",
  "instagram_standalone",
  "facebook",
  "tiktok",
  "youtube",
  "pinterest",
]);

/** Deteksi error token permanen — akun harus dihubungkan ulang user. */
function isPermanentTokenError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("invalid token") ||
    m.includes("token expired") ||
    m.includes("expired_token") ||
    m.includes("invalid_token") ||
    m.includes("unauthorized") ||
    m.includes("401") ||
    m.includes("permission denied") ||
    m.includes("access denied")
  );
}

/** ID generator — prefix sk_ (pola sama apps/server/src/lib/id.ts). */
function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}

export type PostSyncResult = {
  socialAccountId: string;
  platform: string;
  success: boolean;
  postsAttempted: number;
  postsImported: number;
  postsUpdated: number;
  postsSkipped: number;
  error?: string;
};

export type WorkspaceSyncSummary = {
  organizationId: string;
  totalAccounts: number;
  attemptedAccounts: number;
  unsupportedAccounts: number;
  successfulAccounts: number;
  failedAccounts: number;
  totalPostsImported: number;
  totalPostsUpdated: number;
  results: PostSyncResult[];
};

type SyncableAccount = {
  id: string;
  organizationId: string;
  platform: string;
  platformAccountId: string;
  username: string;
  accessTokenEnc: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Sync posts semua akun terhubung milik satu org.
 * Akun diproses paralel per batch 3 (pola sama engagement-sync) untuk
 * menyeimbangkan throughput dan rate limit platform.
 */
export async function syncWorkspacePosts(
  organizationId: string,
  daysSince = 30,
): Promise<WorkspaceSyncSummary> {
  const since = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);

  const accounts = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      username: socialAccount.username,
      accessTokenEnc: socialAccount.accessTokenEnc,
      metadata: socialAccount.metadata,
    })
    .from(socialAccount)
    .where(
      and(eq(socialAccount.organizationId, organizationId), eq(socialAccount.isConnected, true)),
    );

  const syncable = accounts.filter((a) => POSTS_SYNC_PLATFORMS.has(a.platform) && a.accessTokenEnc);
  const results: PostSyncResult[] = [];

  const BATCH_SIZE = 3;
  for (let i = 0; i < syncable.length; i += BATCH_SIZE) {
    const batch = syncable.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((account) => syncAccountPosts(account as SyncableAccount, since)),
    );

    for (const [idx, s] of settled.entries()) {
      const account = batch[idx]!;
      if (s.status === "fulfilled") {
        results.push(s.value);
        // Token permanen invalid → tandai needsReconnect (bukan deactivate —
        // data historis akun tetap dipertahankan, user bisa hubungkan ulang).
        if (!s.value.success && s.value.error && isPermanentTokenError(s.value.error)) {
          await db
            .update(socialAccount)
            .set({ needsReconnect: true, lastError: s.value.error.slice(0, 500) })
            .where(eq(socialAccount.id, account.id));
        }
      } else {
        const message = s.reason instanceof Error ? s.reason.message : String(s.reason);
        results.push({
          socialAccountId: account.id,
          platform: account.platform,
          success: false,
          postsAttempted: 0,
          postsImported: 0,
          postsUpdated: 0,
          postsSkipped: 0,
          error: message,
        });
      }
    }
  }

  return {
    organizationId,
    totalAccounts: accounts.length,
    attemptedAccounts: syncable.length,
    unsupportedAccounts: accounts.length - syncable.length,
    successfulAccounts: results.filter((r) => r.success).length,
    failedAccounts: results.filter((r) => !r.success).length,
    totalPostsImported: results.reduce((sum, r) => sum + r.postsImported, 0),
    totalPostsUpdated: results.reduce((sum, r) => sum + r.postsUpdated, 0),
    results,
  };
}

/** Fetch konten eksternal dari satu akun sesuai platform-nya. */
async function fetchExternalPosts(
  account: SyncableAccount,
  accessToken: string,
  since: Date,
): Promise<ExternalPost[] | { error: string }> {
  // Page access token utk jalur Meta via FB Page (lebih tahan lama)
  const pageToken =
    typeof account.metadata?.pageAccessToken === "string"
      ? (account.metadata.pageAccessToken as string)
      : null;

  switch (account.platform) {
    case "instagram": {
      const [media, stories] = await Promise.all([
        getInstagramMedia(pageToken ?? accessToken, account.platformAccountId, undefined, since),
        getInstagramStories(pageToken ?? accessToken, account.platformAccountId),
      ]);
      if (!media.ok) return { error: media.error };
      return stories.ok ? [...media.data, ...stories.data] : media.data;
    }
    case "instagram_standalone": {
      // IG standalone pakai host graph.instagram.com (Instagram API with Instagram Login)
      const [media, stories] = await Promise.all([
        getInstagramMedia(accessToken, account.platformAccountId, GRAPH_IG, since),
        getInstagramStories(accessToken, account.platformAccountId, GRAPH_IG),
      ]);
      if (!media.ok) return { error: media.error };
      return stories.ok ? [...media.data, ...stories.data] : media.data;
    }
    case "facebook": {
      const [posts, stories] = await Promise.all([
        getFacebookPagePosts(pageToken ?? accessToken, account.platformAccountId, since),
        getFacebookPageStories(pageToken ?? accessToken, account.platformAccountId),
      ]);
      if (!posts.ok) return { error: posts.error };
      return stories.ok ? [...posts.data, ...stories.data] : posts.data;
    }
    case "tiktok": {
      const result = await getTikTokVideos(accessToken, since);
      return result.ok ? result.data : { error: result.error };
    }
    case "youtube": {
      const result = await getYouTubeVideos(accessToken, account.platformAccountId, since);
      return result.ok ? result.data : { error: result.error };
    }
    case "pinterest": {
      const result = await getPinterestPins(accessToken, since);
      return result.ok ? result.data : { error: result.error };
    }
    default:
      return { error: `Platform ${account.platform} tidak didukung posts sync` };
  }
}

/** Sync satu akun: fetch → dedupe → backfill native / upsert eksternal. */
async function syncAccountPosts(account: SyncableAccount, since: Date): Promise<PostSyncResult> {
  const base: PostSyncResult = {
    socialAccountId: account.id,
    platform: account.platform,
    success: false,
    postsAttempted: 0,
    postsImported: 0,
    postsUpdated: 0,
    postsSkipped: 0,
  };

  if (!account.accessTokenEnc) return { ...base, error: "Token tidak tersedia" };
  let accessToken: string;
  try {
    accessToken = decrypt(account.accessTokenEnc);
  } catch {
    return { ...base, error: "Token decrypt gagal" };
  }

  const fetched = await fetchExternalPosts(account, accessToken, since);
  if ("error" in fetched) {
    return { ...base, error: fetched.error };
  }

  // Dedupe lapis 1: platform bisa return item sama di media & stories
  const uniquePosts = new Map<string, ExternalPost>();
  for (const ep of fetched) {
    if (!uniquePosts.has(ep.externalId)) uniquePosts.set(ep.externalId, ep);
  }
  const deduplicated = [...uniquePosts.values()];
  if (deduplicated.length === 0) return { ...base, success: true };

  // Dedupe lapis 2: pre-fetch post native org+platform dengan platformPostId
  // (satu query — O(1) lookup per post via Map).
  const nativeRows = await db
    .select({ id: post.id, platformPostId: post.platformPostId, externalId: post.externalId })
    .from(post)
    .where(
      and(
        eq(post.organizationId, account.organizationId),
        eq(post.platform, account.platform as never),
        eq(post.isExternal, false),
      ),
    );
  const nativeByPlatformPostId = new Map(
    nativeRows
      .filter((r) => r.platformPostId)
      .map((r) => [r.platformPostId!, { id: r.id, externalId: r.externalId }]),
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const UPSERT_BATCH = 10;
  for (let i = 0; i < deduplicated.length; i += UPSERT_BATCH) {
    const batch = deduplicated.slice(i, i + UPSERT_BATCH);
    await Promise.allSettled(
      batch.map(async (ep) => {
        try {
          // Match post native → backfill kolom external (bukan insert baru)
          const native = nativeByPlatformPostId.get(ep.externalId);
          if (native) {
            if (!native.externalId) {
              // Hapus row eksternal orphan dulu (siklus sync sebelumnya bisa sudah
              // insert externalId sama) agar backfill tidak kena unique constraint.
              await db
                .delete(post)
                .where(
                  and(
                    eq(post.organizationId, account.organizationId),
                    eq(post.externalId, ep.externalId),
                    eq(post.isExternal, true),
                  ),
                );
              await db
                .update(post)
                .set({
                  externalId: ep.externalId,
                  externalUrl: ep.permalink || null,
                  syncedAt: new Date(),
                })
                .where(eq(post.id, native.id));
              updated++;
            }
            skipped++;
            return;
          }

          // Insert baru — race dengan sync paralel ditangani unique constraint:
          // kena constraint → row sudah ada → update (refresh konten/syncedAt).
          try {
            await db.insert(post).values({
              id: generateId("post"),
              organizationId: account.organizationId,
              postGroupId: null,
              socialAccountId: account.id,
              platform: account.platform as never,
              status: "published",
              isExternal: true,
              externalId: ep.externalId,
              externalUrl: ep.permalink || null,
              externalThumbnailUrl: ep.thumbnailUrl ?? null,
              syncedAt: new Date(),
              content: ep.caption || null,
              platformPostId: ep.externalId,
              platformPostUrl: ep.permalink || null,
              publishedAt: ep.publishedAt,
              platformSettings: {
                mediaType: ep.mediaType,
                ...(ep.mediaUrl ? { mediaUrl: ep.mediaUrl } : {}),
              },
            });
            imported++;
          } catch (upsertError) {
            const isUniqueViolation =
              upsertError instanceof Error &&
              "code" in upsertError &&
              (upsertError as { code?: string }).code === "23505";
            if (isUniqueViolation) {
              await db
                .update(post)
                .set({
                  content: ep.caption || null,
                  externalUrl: ep.permalink || null,
                  externalThumbnailUrl: ep.thumbnailUrl ?? null,
                  platformPostUrl: ep.permalink || null,
                  publishedAt: ep.publishedAt,
                  syncedAt: new Date(),
                })
                .where(
                  and(
                    eq(post.organizationId, account.organizationId),
                    eq(post.externalId, ep.externalId),
                  ),
                );
              updated++;
            } else {
              throw upsertError;
            }
          }
        } catch {
          skipped++;
        }
      }),
    );
  }

  return {
    ...base,
    success: true,
    postsAttempted: deduplicated.length,
    postsImported: imported,
    postsUpdated: updated,
    postsSkipped: skipped,
  };
}

/**
 * Worker: sync post eksternal semua org yang punya akun syncable.
 * Maks maxOrgs per siklus untuk menjaga rate limit platform.
 */
export async function syncDueOrganizationsPosts(
  maxOrgs = 10,
  daysSince = 30,
): Promise<{ organizations: number; imported: number; updated: number; errors: string[] }> {
  // Org unik yang punya akun aktif di platform syncable
  const rows = await db
    .selectDistinct({ organizationId: socialAccount.organizationId })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.isConnected, true),
        inArray(socialAccount.platform, [...POSTS_SYNC_PLATFORMS] as never[]),
      ),
    )
    .limit(maxOrgs);

  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const summary = await syncWorkspacePosts(row.organizationId, daysSince);
      imported += summary.totalPostsImported;
      updated += summary.totalPostsUpdated;
      for (const r of summary.results) {
        if (!r.success && r.error) errors.push(`${r.platform}@${r.socialAccountId}: ${r.error}`);
      }
    } catch (error) {
      errors.push(
        `org ${row.organizationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { organizations: rows.length, imported, updated, errors };
}
