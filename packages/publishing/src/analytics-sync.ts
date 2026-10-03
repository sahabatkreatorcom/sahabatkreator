// Sinkronisasi analytics (insights) dari platform → tabel account_analytics + post_analytics
//
// Menjalankan fetch metrik akun (followers, dst) dan metrik post published
// (likes, comments, views, dst), lalu upsert snapshot harian:
// - account_analytics: unique (social_account_id, date)
// - post_analytics: unique (post_id, date) — snapshot kumulatif lifetime
//
// Bagian fetch per platform (adapter HTTP) dipecah ke analytics-metrics.ts;
// file ini hanya orchestrasi DB + penjadwalan batch.
//
// DUA pintu masuk (keduanya lewat `runAnalyticsForAccounts` yang sama):
// - `syncDueAnalyticsAccounts` → worker, antrean GLOBAL: maks 10 akun/siklus,
//   tiap 1 jam, hanya akun yang belum punya snapshot hari ini.
// - `syncWorkspaceAnalytics`   → tombol "Sinkron Platform", SATU organisasi.
//   Ada karena antrean global membuat akun/post yang baru masuk menampilkan
//   metrik 0 sampai ~1 jam — pengguna menyangka sinkronisasinya gagal.

import { db } from "@sahabatkreator/db";
import { accountAnalytics, post, postAnalytics, socialAccount } from "@sahabatkreator/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  type AccountMetrics,
  fetchAccountMetrics,
  fetchPostMetrics,
  type PostMetrics,
} from "./analytics-metrics";
import { decrypt } from "./crypto";
import { isThrottleError } from "./rate-limits";

// Re-export agar konsumsi lama (packages/publishing/src/index.ts) tidak putus —
// tipe & fetcher sekarang tinggal di analytics-metrics.
export { type AccountMetrics, fetchAccountMetrics, fetchPostMetrics, type PostMetrics };

/**
 * Platform yang punya adapter metrik (akun + post).
 *
 * Pinterest sengaja TIDAK ikut: Developer Guidelines melarang menyimpan data
 * apa pun dari API-nya — analitik Pinterest diambil on-demand lewat
 * `GET /analytics/pinterest`. Daftar ini dipakai dua jalur (worker global dan
 * sync manual per organisasi) supaya keduanya tidak pernah berbeda.
 */
const ANALYTICS_PLATFORMS = new Set<string>([
  "instagram",
  "instagram_standalone",
  "facebook",
  "threads",
  "tiktok",
  "youtube",
  "bluesky",
  "linkedin",
  "linkedin_org",
]);

/** Akun diproses paralel dalam batch kecil — satu akun gagal tidak menghentikan
 *  batch lainnya (Promise.allSettled), tapi API platform tetap tidak dibanjiri. */
const ANALYTICS_BATCH_SIZE = 3;

/** Cap post per akun per siklus. Window posts-sync 90 hari bisa mengimpor
 *  puluhan post sekaligus; 25 post/akun sudah cukup untuk mengisi angka post
 *  terbaru lebih dulu tanpa menembus rate limit Meta (200 call/jam). */
const POSTS_PER_CYCLE = 25;

/** Snapshot hari ini yang metriknya MASIH NOL dianggap stale dan disink ulang
 *  (lihat `syncAccountAnalytics`). Batas umur minimum mencegah pemanggilan API
 *  berulang tiap siklus. */
const STALE_AFTER_MINUTES = 45;

/** Konteks akun untuk analytics sync (dipakai worker & route manual) */
export type AnalyticsAccount = {
  id: string;
  organizationId: string;
  platform: string;
  platformAccountId: string;
  username: string | null;
  accessTokenEnc: string | null;
  metadata: Record<string, unknown> | null;
};

/** Hasil satu siklus sync analytics akun */
export type AnalyticsSyncResult = {
  platform: string;
  accountSaved: boolean;
  postsSynced: number;
  error?: string;
  /**
   * True bila platform membatasi permintaan (kuota habis). Sync dihentikan lebih
   * awal — meneruskan panggilan hanya memperpanjang blokir menurut dokumentasi
   * Meta sendiri — dan pemanggil bisa memberi pesan yang jelas ke pengguna.
   */
  throttled?: boolean;
};

// ---------------------------------------------------------------------------
// Upsert snapshot harian
// ---------------------------------------------------------------------------

/** Upsert account_analytics snapshot hari ini (unique social_account_id + date) */
export async function upsertAccountAnalytics(
  account: { id: string; organizationId: string; platform: string },
  metrics: AccountMetrics,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const values = {
    followers: metrics.followers ?? null,
    following: metrics.following ?? null,
    posts: metrics.posts ?? null,
    impressions: metrics.impressions ?? null,
    reach: metrics.reach ?? null,
    profileViews: metrics.profileViews ?? null,
    websiteClicks: metrics.websiteClicks ?? null,
    engagementCount: metrics.engagementCount ?? null,
  };
  await db
    .insert(accountAnalytics)
    .values({
      id: generateId("acca"),
      organizationId: account.organizationId,
      socialAccountId: account.id,
      platform: account.platform as never,
      date: today,
      ...values,
    })
    .onConflictDoUpdate({
      target: [accountAnalytics.socialAccountId, accountAnalytics.date],
      set: values,
    });
}

/** Upsert post_analytics snapshot hari ini (unique post_id + date) */
export async function upsertPostAnalytics(
  postRow: { id: string; organizationId: string; socialAccountId: string; platform: string },
  metrics: PostMetrics,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const values = {
    likes: metrics.likes ?? 0,
    comments: metrics.comments ?? 0,
    shares: metrics.shares ?? 0,
    saves: metrics.saves ?? 0,
    views: metrics.views ?? 0,
    impressions: metrics.impressions ?? 0,
    reach: metrics.reach ?? 0,
    websiteClicks: metrics.websiteClicks ?? 0,
  };
  await db
    .insert(postAnalytics)
    .values({
      id: generateId("posta"),
      organizationId: postRow.organizationId,
      postId: postRow.id,
      socialAccountId: postRow.socialAccountId,
      platform: postRow.platform as never,
      date: today,
      ...values,
    })
    .onConflictDoUpdate({
      target: [postAnalytics.postId, postAnalytics.date],
      // updatedAt wajib di-set manual: dipakai syncAccountAnalytics untuk menilai
      // apakah snapshot hari ini masih segar atau sudah stale (metriknya nol).
      set: { ...values, updatedAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Sync satu akun (metrik akun + post published terbaru)
// ---------------------------------------------------------------------------

/**
 * Sync analytics satu akun: metrik akun + metrik max 25 post published terbaru
 * yang punya platformPostId.
 *
 * Error per post tidak menghentikan post lain — KECUALI saat platform membatasi
 * permintaan (throttle). Saat itu sync dihentikan: sisa post akan gagal dengan
 * sebab yang sama, dan meneruskan panggilan justru memperpanjang blokir.
 */
export async function syncAccountAnalytics(
  account: AnalyticsAccount,
  accessToken: string,
): Promise<AnalyticsSyncResult> {
  const result: AnalyticsSyncResult = {
    platform: account.platform,
    accountSaved: false,
    postsSynced: 0,
  };
  try {
    const metrics = await fetchAccountMetrics(
      account.platform,
      account.platformAccountId,
      accessToken,
      account.metadata,
    );
    if (Object.values(metrics).some((v) => v !== null && v !== undefined)) {
      await upsertAccountAnalytics(
        { id: account.id, organizationId: account.organizationId, platform: account.platform },
        metrics,
      );
      result.accountSaved = true;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message.slice(0, 200) : String(error);
    // Kuota habis → jangan lanjut ke post; semuanya akan gagal dengan sebab sama.
    if (isThrottleError(result.error)) {
      result.throttled = true;
      return result;
    }
  }

  // Post published terbaru milik akun ini (punya platformPostId). Diurutkan
  // publishedAt desc — window 90 hari bisa impor banyak post sekaligus, post
  // terbaru harus didahulukan agar metriknya terisi lebih dulu.
  let posts: Array<{ id: string; platformPostId: string }>;
  try {
    const rows = await db
      .select({ id: post.id, platformPostId: post.platformPostId })
      .from(post)
      .where(and(eq(post.socialAccountId, account.id), eq(post.status, "published")))
      .orderBy(desc(post.publishedAt))
      .limit(200);
    posts = rows.filter((p): p is { id: string; platformPostId: string } =>
      Boolean(p.platformPostId),
    );
  } catch {
    return result;
  }

  // Post terbaru yang belum punya snapshot hari ini disinkron.
  const today = new Date().toISOString().slice(0, 10);
  // Snapshot hari ini yang metriknya MASIH NOL ikut disink ulang (stale), supaya
  // post yang tersink sebelum interaksi datang tidak tersangkut 0 seharian.
  // Dibatasi umur minimum agar tidak memanggil API berulang tiap siklus.
  const staleBefore = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000);
  let alreadySynced: Set<string>;
  try {
    const existing = await db
      .select({
        postId: postAnalytics.postId,
        updatedAt: postAnalytics.updatedAt,
        likes: postAnalytics.likes,
        comments: postAnalytics.comments,
        shares: postAnalytics.shares,
        saves: postAnalytics.saves,
        views: postAnalytics.views,
        impressions: postAnalytics.impressions,
        reach: postAnalytics.reach,
      })
      .from(postAnalytics)
      .where(
        and(
          eq(postAnalytics.socialAccountId, account.id),
          eq(postAnalytics.date, today),
          posts.length > 0
            ? inArray(
                postAnalytics.postId,
                posts.map((p) => p.id),
              )
            : undefined,
        ),
      );
    // Anggap "sudah sinkron" hanya bila ada metrik non-nol ATAU snapshot masih
    // segar. Sisanya dianggap stale → disink ulang.
    alreadySynced = new Set(
      existing
        .filter((r) => {
          const hasEngagement =
            (r.likes ?? 0) > 0 ||
            (r.comments ?? 0) > 0 ||
            (r.shares ?? 0) > 0 ||
            (r.saves ?? 0) > 0 ||
            (r.views ?? 0) > 0 ||
            (r.impressions ?? 0) > 0 ||
            (r.reach ?? 0) > 0;
          if (hasEngagement) return true;
          return Boolean(r.updatedAt && r.updatedAt > staleBefore);
        })
        .map((r) => r.postId),
    );
  } catch {
    alreadySynced = new Set();
  }

  // Sinkronkan post terbaru yang belum punya snapshot hari ini.
  // Cap 25/siklus (naik dari 10): window posts-sync 90 hari bisa impor puluhan
  // post baru sekaligus — cap lama membuat post yang baru diimpor menunggu
  // berhari-hari sampai metriknya terisi.
  const targets = posts
    .slice(0, POSTS_PER_CYCLE + alreadySynced.size)
    .filter((p) => !alreadySynced.has(p.id))
    .slice(0, POSTS_PER_CYCLE);

  for (const p of targets) {
    try {
      if (!p.platformPostId) continue;
      const metrics = await fetchPostMetrics(
        account.platform,
        p.platformPostId,
        accessToken,
        account.metadata,
        account.platformAccountId,
      );
      await upsertPostAnalytics(
        {
          id: p.id,
          organizationId: account.organizationId,
          socialAccountId: account.id,
          platform: account.platform,
        },
        metrics,
      );
      result.postsSynced++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : String(error);
      // Kuota habis → STOP, jangan lanjut ke post berikutnya. Dua alasan:
      // (1) sisa post akan gagal dengan sebab yang sama, dan (2) dokumentasi Meta
      // menyatakan panggilan yang terus dilakukan justru memperpanjang blokir.
      // Sebelumnya error ini ditelan `catch {}` kosong sehingga metrik tampak 0
      // tanpa penjelasan apa pun — persis kebingungan yang sulit dilacak.
      if (isThrottleError(message)) {
        result.throttled = true;
        result.error = message;
        break;
      }
      // Post tertentu gagal (deleted di platform, API error) — lanjut post lain
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sinkronisasi massal — worker (antrean global) & tombol "Sinkron Platform" (per org)
// ---------------------------------------------------------------------------

/** Ringkasan satu putaran sync analytics (worker maupun manual per organisasi). */
export type AnalyticsBatchResult = {
  /** Jumlah akun yang diproses. */
  synced: number;
  /** Jumlah snapshot metrik post yang berhasil ditulis. */
  postsSynced: number;
  /** Jumlah akun yang dibatasi platform (kuota habis) pada putaran ini. */
  throttled: number;
  /** Pesan error yang perlu dilaporkan (sudah dipotong 200 karakter). */
  errors: string[];
};

/**
 * Jalankan `syncAccountAnalytics` untuk sekumpulan akun, paralel per batch kecil.
 * Satu akun gagal (token ditolak, decrypt gagal, API error) tidak menghentikan
 * akun lain — errornya dikumpulkan supaya pemanggil bisa melaporkannya.
 */
async function runAnalyticsForAccounts(
  accounts: AnalyticsAccount[],
): Promise<AnalyticsBatchResult> {
  let synced = 0;
  let postsSynced = 0;
  let throttled = 0;
  const errors: string[] = [];

  for (let i = 0; i < accounts.length; i += ANALYTICS_BATCH_SIZE) {
    const batch = accounts.slice(i, i + ANALYTICS_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (account) => {
        // Akun bridge: token platform disimpan Repliz — syncAccountAnalytics
        // dispatch bridge via metadata (fetchPostMetrics → replizPostMetrics).
        if (!account.accessTokenEnc && !account.metadata?.replizAccountId) {
          return {
            platform: account.platform,
            accountSaved: false,
            postsSynced: 0,
            error: "Token tidak tersedia",
          };
        }
        const accessToken = account.accessTokenEnc ? decrypt(account.accessTokenEnc) : "";
        return syncAccountAnalytics(account, accessToken);
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        // decrypt gagal / exception tak terduga — catat, lanjut akun lain
        errors.push(
          outcome.reason instanceof Error
            ? outcome.reason.message.slice(0, 200)
            : String(outcome.reason),
        );
        continue;
      }
      synced++;
      postsSynced += outcome.value.postsSynced;
      if (outcome.value.throttled) throttled++;
      if (outcome.value.error) errors.push(`${outcome.value.platform}: ${outcome.value.error}`);
    }
  }

  return { synced, postsSynced, throttled, errors };
}

/**
 * Saring akun yang belum punya snapshot `account_analytics` hari ini.
 *
 * `force` melewati filter ini — dipakai sync manual: akun yang sudah tersink
 * pagi tadi tetap harus bisa disegarkan setelah post barunya diimpor, kalau
 * tidak metrik post baru itu tersangkut 0 sampai hari berikutnya.
 */
async function filterDueAccounts(
  candidates: AnalyticsAccount[],
  maxAccounts: number,
  force = false,
): Promise<AnalyticsAccount[]> {
  if (force || candidates.length === 0) return candidates.slice(0, maxAccounts);
  const today = new Date().toISOString().slice(0, 10);
  const syncedToday = await db
    .selectDistinct({ socialAccountId: accountAnalytics.socialAccountId })
    .from(accountAnalytics)
    .where(
      and(
        eq(accountAnalytics.date, today),
        inArray(
          accountAnalytics.socialAccountId,
          candidates.map((a) => a.id),
        ),
      ),
    );
  const done = new Set(syncedToday.map((r) => r.socialAccountId));
  return candidates.filter((a) => !done.has(a.id)).slice(0, maxAccounts);
}

/** Akun yang punya adapter metrik & kredensial yang bisa dipakai. */
function analyticsCandidates(accounts: AnalyticsAccount[]): AnalyticsAccount[] {
  // Akun bridge Repliz tidak punya token lokal (disimpan Repliz) — tetap disync.
  return accounts.filter(
    (a) => (a.accessTokenEnc || a.metadata?.replizAccountId) && ANALYTICS_PLATFORMS.has(a.platform),
  );
}

/**
 * Sync analytics akun yang due (lastAnalyticsAt tidak ada di schema — pakai
 * snapshot terakhir account_analytics: akun tanpa snapshot hari ini = due).
 * Interval 1 jam (metrik berubah lambat, hemat rate limit).
 * Akun diproses paralel dalam batch kecil — satu akun gagal tidak
 * menghentikan batch lainnya (Promise.allSettled).
 */
export async function syncDueAnalyticsAccounts(maxAccounts = 10): Promise<AnalyticsBatchResult> {
  // Akun connected non-manual
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
    .where(eq(socialAccount.isConnected, true))
    .limit(maxAccounts * 3);

  const due = await filterDueAccounts(analyticsCandidates(accounts), maxAccounts);
  return runAnalyticsForAccounts(due);
}

/**
 * Sync analytics SEMUA akun terhubung milik satu organisasi.
 *
 * MENGAPA ADA: `syncDueAnalyticsAccounts` (worker) memakai antrean GLOBAL —
 * maks 10 akun per siklus, interval 1 jam, dan akun yang sudah punya snapshot
 * hari ini tidak diambil lagi. Akibatnya akun yang baru dihubungkan, atau post
 * yang baru diimpor `posts-sync`, menampilkan metrik 0 sampai ~1 jam. Karena
 * tombol "Sinkron Platform" hanya mengimpor KONTEN, pengguna melihat angkanya
 * tidak berubah sama sekali dan menyangka sinkronisasi gagal.
 *
 * Dipanggil setelah `syncWorkspacePosts` supaya konten DAN metriknya segar
 * dalam satu tindakan. Snapshot per-post tetap punya pengaman sendiri di
 * `syncAccountAnalytics` (post dengan metrik non-nol atau snapshot < 45 menit
 * tidak ditembak ulang), jadi `force` tidak membanjiri API platform.
 */
export async function syncWorkspaceAnalytics(
  organizationId: string,
  opts: { force?: boolean; maxAccounts?: number } = {},
): Promise<AnalyticsBatchResult> {
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

  const due = await filterDueAccounts(
    analyticsCandidates(accounts),
    opts.maxAccounts ?? 25,
    opts.force ?? false,
  );
  return runAnalyticsForAccounts(due);
}

/** ID generator — pola sama dengan apps/server/src/lib/id.ts (prefix sk_) */
function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}
