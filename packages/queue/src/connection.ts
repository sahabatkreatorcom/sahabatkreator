// Koneksi Redis + factory queue BullMQ per platform
// Pola: satu queue per platform → rate limiter BullMQ menerapkan limit per-platform
// (TikTok init 6/mnt, Bluesky 5.000 poin/jam, dst — dari riset docs/social-platforms)

import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";

let connection: ConnectionOptions | null = null;

/**
 * Konfigurasi koneksi Redis. Return null bila REDIS_URL tidak diset →
 * caller harus fallback ke DB polling (graceful degradation).
 */
export function getRedisConnection(): ConnectionOptions | null {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  connection = { url, maxRetriesPerRequest: null, enableReadyCheck: false };
  return connection;
}

/** Nama queue per platform — prefix sk_ menghindari bentrok db lain di Redis shared */
export function queueNameForPlatform(platform: string): string {
  return `sk_publish_${platform}`;
}

/**
 * Rate limiter per platform (job/detik) — konservatif dari riset:
 * TikTok init 6/mnt/user → global worker 1 job/12s
 * IG/FB Graph: 200 calls/jam/user → 1 job/3s aman
 */
const PLATFORM_RATE_LIMITS: Record<string, { max: number; duration: number }> = {
  tiktok: { max: 1, duration: 12_000 },
  instagram: { max: 1, duration: 3_000 },
  instagram_standalone: { max: 1, duration: 3_000 },
  facebook: { max: 1, duration: 3_000 },
  threads: { max: 1, duration: 3_000 },
  youtube: { max: 1, duration: 5_000 },
  pinterest: { max: 1, duration: 5_000 },
  linkedin: { max: 1, duration: 3_000 },
  bluesky: { max: 1, duration: 2_000 },
  google_business: { max: 1, duration: 3_000 },
  manual: { max: 1, duration: 1_000 },
};

const queues = new Map<string, Queue>();

export type PublishJobData = {
  type: "publish";
  postId: string;
  platform: string;
};

export type PollJobData = {
  type: "poll";
  postId: string;
  platform: string;
};

export type JobData = PublishJobData | PollJobData;

/** Rate limiter per platform — dipakai WorkerOptions (BullMQ v6: limiter di worker, bukan queue) */
export function platformRateLimiter(platform: string): { max: number; duration: number } {
  return PLATFORM_RATE_LIMITS[platform] ?? { max: 1, duration: 3_000 };
}

/** Queue publish per platform (lazy-init, reuse antar call) */
export function getPublishQueue(platform: string): Queue<JobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  let q = queues.get(platform);
  if (!q) {
    q = new Queue<JobData>(queueNameForPlatform(platform), {
      connection: conn,
      defaultJobOptions: {
        // Retry exponential: 30s, 2m, 8m, 30m, 2j (BullMQ backoff delay diterapkan bila throw)
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    queues.set(platform, q);
  }
  return q;
}

/** Tutup semua queue (graceful shutdown) */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
