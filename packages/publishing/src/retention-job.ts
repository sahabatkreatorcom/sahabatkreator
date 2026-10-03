// Job retensi — menghapus data akun yang aksesnya sudah hilang melewati masa
// tenggang. Ini bagian yang MEMENUHI KEWAJIBAN platform, bukan sekadar bersih-bersih:
//
// - Meta Platform Terms §3.d.i.2.d — hapus data platform "as soon as reasonably
//   possible" begitu user tidak lagi punya akun di layanan kita.
// - YouTube Developer Policies III.E.4.c/d — data yang tidak bisa lagi
//   disegarkan wajib dihapus maksimal 30 hari kalender.
// - LinkedIn API Terms §4.4 / TikTok Developer Terms §VI — hapus segera saat
//   akses berakhir.
//
// YANG DIHAPUS: baris `social_account` itu sendiri. Seluruh data turunannya
// (post, post_analytics, account_analytics, dm_conversation, dm_message,
// engagement_item) ikut terhapus lewat ON DELETE CASCADE — jadi ini benar-benar
// "hapus semua Platform Data", bukan menyisakan sisa yang tak bisa dijangkau.
//
// YANG TIDAK DISENTUH: akun yang masih sehat. Retensi hanya berlaku untuk akun
// yang tidak bisa lagi kita jaga kesegarannya — pelanggan aktif tidak pernah
// kehilangan data karena umur.

import { db } from "@sahabatkreator/db";
import {
  accountAnalytics,
  dmConversation,
  engagementItem,
  post,
  postAnalytics,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { eq, or, sql } from "drizzle-orm";
import {
  ACCESS_LOST_RETENTION_DAYS,
  isRetentionExpired,
  type RetentionCandidate,
  retentionDeadline,
} from "./retention";

/** Berapa akun yang diproses per siklus — penghapusan jarang, tapi tetap dibatasi
 *  supaya satu siklus tidak pernah menjadi operasi DB raksasa. */
const PURGE_BATCH_SIZE = 50;

/** Berapa baris turunan yang ikut terhapus (untuk jejak audit di log). */
export type PurgedAccountCounts = {
  posts: number;
  postAnalytics: number;
  accountAnalytics: number;
  dmConversations: number;
  engagementItems: number;
};

export type PurgedAccount = {
  id: string;
  platform: string;
  username: string | null;
  organizationId: string;
  /** Jam mulai retensi yang dipakai (accessLostAt, atau updatedAt sebagai cadangan). */
  accessLostAt: Date;
  /** Kapan seharusnya sudah dihapus — berguna untuk memverifikasi jadwal. */
  deadline: Date;
  counts: PurgedAccountCounts;
};

export type RetentionPurgeResult = {
  /** Jumlah akun bermasalah yang diperiksa. */
  scanned: number;
  /** Akun yang benar-benar dihapus. */
  purged: PurgedAccount[];
  /** Akun bermasalah yang masih dalam masa tenggang (belum dihapus). */
  retained: number;
  errors: string[];
};

/** Hitung baris turunan sebelum dihapus — jejak audit "apa yang hilang". */
async function countDependents(accountId: string): Promise<PurgedAccountCounts> {
  const [posts, postAn, accountAn, dm, engagement] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(post)
      .where(eq(post.socialAccountId, accountId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(postAnalytics)
      .where(eq(postAnalytics.socialAccountId, accountId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(accountAnalytics)
      .where(eq(accountAnalytics.socialAccountId, accountId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(dmConversation)
      .where(eq(dmConversation.socialAccountId, accountId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(engagementItem)
      .where(eq(engagementItem.socialAccountId, accountId)),
  ]);
  return {
    posts: posts[0]?.n ?? 0,
    postAnalytics: postAn[0]?.n ?? 0,
    accountAnalytics: accountAn[0]?.n ?? 0,
    dmConversations: dm[0]?.n ?? 0,
    engagementItems: engagement[0]?.n ?? 0,
  };
}

/**
 * Hapus data akun yang aksesnya hilang dan sudah melewati masa tenggang.
 *
 * Idempoten dan aman dijalankan berulang: akun yang masih dalam masa tenggang
 * hanya dihitung, tidak disentuh. Panggil dari cron harian worker.
 */
export async function purgeExpiredAccounts(
  opts: { now?: Date; days?: number; limit?: number } = {},
): Promise<RetentionPurgeResult> {
  const now = opts.now ?? new Date();
  const days = opts.days ?? ACCESS_LOST_RETENTION_DAYS;
  const limit = opts.limit ?? PURGE_BATCH_SIZE;

  const result: RetentionPurgeResult = { scanned: 0, purged: [], retained: 0, errors: [] };

  // Kandidat = akun yang aksesnya hilang (needsReconnect, atau koneksinya
  // dimatikan). Akun sehat tidak pernah masuk kueri ini.
  const candidates = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      username: socialAccount.username,
      accessLostAt: socialAccount.accessLostAt,
      updatedAt: socialAccount.updatedAt,
      needsReconnect: socialAccount.needsReconnect,
      isConnected: socialAccount.isConnected,
    })
    .from(socialAccount)
    .where(or(eq(socialAccount.needsReconnect, true), eq(socialAccount.isConnected, false)))
    .limit(limit * 4);

  const expired = candidates
    .filter((row) => isRetentionExpired(row as RetentionCandidate, now, days))
    .slice(0, limit);

  result.scanned = candidates.length;
  result.retained = candidates.length - expired.length;

  for (const row of expired) {
    try {
      // accessLostAt dijamin ada: isRetentionExpired() hanya true bila jam mulai
      // bisa diresolusi (kolomnya terisi, atau jatuh ke updatedAt).
      const since = row.accessLostAt ?? row.updatedAt;
      const counts = await countDependents(row.id);
      await db.delete(socialAccount).where(eq(socialAccount.id, row.id));
      result.purged.push({
        id: row.id,
        platform: row.platform,
        username: row.username,
        organizationId: row.organizationId,
        accessLostAt: since,
        deadline: retentionDeadline(since, days),
        counts,
      });
    } catch (error) {
      result.errors.push(
        `${row.platform} (${row.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}
