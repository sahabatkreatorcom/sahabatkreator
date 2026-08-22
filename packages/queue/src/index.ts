/**
 * Queue paket — konfigurasi BullMQ + helper enqueue.
 *
 * Dipakai untuk scheduling job yang butuh ketepatan & retry:
 *   - publish-post  : publish post terjadwal (delay = selisih ke scheduledAt)
 *   - analytics-sync: sinkronkan metrik analytics sebuah org
 *   - inbox-sync    : sinkronkan komentar sebuah org
 *
 * Redis dihubungkan via env REDIS_URL. BullMQ sudah membawa ioredis sendiri.
 * Bila REDIS_URL tidak dikonfigurasi, helper enqueue menjadi no-op sehingga
 * aplikasi tetap jalan (fallback ke cron DB polling `/api/cron/publish`).
 */

export const QUEUE_PUBLISH = "publish-post";
export const QUEUE_SYNC = "sync";
export const QUEUE_STALE_CLEANUP = "stale-post-cleanup";

export interface PublishPostJobData {
    postId: string;
    organizationId: string;
    platform: string;
}

export type SyncJobType = "analytics" | "inbox";

export interface SyncJobData {
    organizationId: string;
    type: SyncJobType;
}

export interface StaleCleanupJobData {
    type: "stale-cleanup";
}

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function isRedisConfigured(): boolean {
    return Boolean(process.env.REDIS_URL);
}

/** Opsi koneksi ioredis yang aman untuk production (retry terbatas, timeout). */
export function redisConnectionOptions() {
    return {
        host: getRedisHost(),
        port: getRedisPort(),
        username: getRedisUsername(),
        password: getRedisPassword(),
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 10_000,
        lazyConnect: true,
    };
}

function getRedisHost(): string {
    try {
        return new URL(REDIS_URL).hostname || "localhost";
    } catch {
        return "localhost";
    }
}

function getRedisPort(): number {
    try {
        const url = new URL(REDIS_URL);
        return url.port ? Number(url.port) : 6379;
    } catch {
        return 6379;
    }
}

function getRedisUsername(): string | undefined {
    try {
        const url = new URL(REDIS_URL);
        return url.username ? decodeURIComponent(url.username) : undefined;
    } catch {
        return undefined;
    }
}

function getRedisPassword(): string | undefined {
    try {
        const url = new URL(REDIS_URL);
        return url.password ? decodeURIComponent(url.password) : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Buat instance BullMQ Queue untuk penggunaan lanjutan (mis. worker terpisah).
 * Harus di-close oleh pemanggil.
 */
export async function createQueue(name: string) {
    const { Queue } = await import("bullmq");
    return new Queue(name, { connection: redisConnectionOptions() });
}

/**
 * Enqueue job publish post dengan delay hingga waktu jadwal.
 * No-op bila REDIS_URL belum dikonfigurasi. `jobId` dibuat deterministik agar
 * enqueue berulang (mis. update jadwal) tidak menumpuk job ganda.
 */
export async function enqueuePublishPost(
    organizationId: string,
    postId: string,
    platform: string,
    scheduledAt: Date,
): Promise<boolean> {
    if (!isRedisConfigured()) return false;
    const delayMs = Math.max(0, scheduledAt.getTime() - Date.now());

    const { Queue } = await import("bullmq");
    const queue = new Queue(QUEUE_PUBLISH, { connection: redisConnectionOptions() });
    try {
        await queue.add(
            "publish",
            { postId, organizationId, platform } satisfies PublishPostJobData,
            {
                delay: delayMs,
                jobId: `post-${postId}`,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
                attempts: 3,
                backoff: { type: "exponential", delay: 30_000 },
            },
        );
        return true;
    } finally {
        await queue.close();
    }
}

/** Hapus job publish yang tertunda (mis. post dibatalkan/dijadwal ulang). */
export async function removePublishJob(postId: string): Promise<boolean> {
    if (!isRedisConfigured()) return false;
    const { Queue } = await import("bullmq");
    const queue = new Queue(QUEUE_PUBLISH, { connection: redisConnectionOptions() });
    try {
        await queue.remove(`post-${postId}`);
        return true;
    } finally {
        await queue.close();
    }
}

/**
 * Enqueue sinkronisasi (analytics / inbox) sebuah org.
 * No-op bila REDIS_URL belum dikonfigurasi.
 */
export async function enqueueSync(organizationId: string, type: SyncJobType): Promise<boolean> {
    if (!isRedisConfigured()) return false;
    const { Queue } = await import("bullmq");
    const queue = new Queue(QUEUE_SYNC, { connection: redisConnectionOptions() });
    try {
        await queue.add(
            "sync",
            { organizationId, type } satisfies SyncJobData,
            {
                jobId: `${type}:${organizationId}:${new Date().toISOString()}`,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 100 },
                attempts: 2,
                backoff: { type: "exponential", delay: 10_000 },
            },
        );
        return true;
    } finally {
        await queue.close();
    }
}

/**
 * Check koneksi Redis. Returns true bila Redis tersedia atau tidak dikonfigurasi (opsional).
 * Dipakai oleh /api/health untuk monitoring readiness.
 */
export async function checkRedisHealth(): Promise<boolean> {
    if (!isRedisConfigured()) return true;
    try {
        const opts = redisConnectionOptions();
        const { default: IORedis } = await import("ioredis");
        const client = new IORedis({
            host: opts.host,
            port: opts.port,
            username: opts.username,
            password: opts.password,
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            lazyConnect: true,
        });
        await client.connect();
        await client.ping();
        await client.quit();
        return true;
    } catch {
        return false;
    }
}

/**
 * Ambil status (active/pending/failed/delayed) dari sebuah BullMQ queue.
 * No-op bila REDIS_URL belum dikonfigurasi.
 */
export async function getQueueStatus(name: string): Promise<{
    active: number;
    pending: number;
    failed: number;
    delayed: number;
}> {
    if (!isRedisConfigured()) {
        return { active: 0, pending: 0, failed: 0, delayed: 0 };
    }
    const { Queue } = await import("bullmq");
    const queue = new Queue(name, { connection: redisConnectionOptions() });
    try {
        const [active, waiting, failed, delayed] = await Promise.all([
            queue.getActiveCount(),
            queue.getWaitingCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
        ]);
        return { active, pending: waiting, failed, delayed };
    } finally {
        await queue.close();
    }
}

/**
 * Enqueue stale-post cleanup sebagai repeatable job (setiap 60 detik).
 * Cukup panggil sekali saat app start — BullMQ menyimpan repeat schedule di Redis.
 * No-op bila REDIS_URL belum dikonfigurasi.
 */
export async function enqueueStaleCleanup(): Promise<boolean> {
    if (!isRedisConfigured()) return false;
    const { Queue } = await import("bullmq");
    const queue = new Queue(QUEUE_STALE_CLEANUP, { connection: redisConnectionOptions() });
    try {
        await queue.add(
            "stale-cleanup",
            { type: "stale-cleanup" } satisfies StaleCleanupJobData,
            {
                jobId: "stale-cleanup",
                repeat: { pattern: "*/60 * * * * *" }, // every 60 seconds
                removeOnComplete: { count: 10 },
                removeOnFail: { count: 10 },
                attempts: 1,
            },
        );
        return true;
    } finally {
        await queue.close();
    }
}
