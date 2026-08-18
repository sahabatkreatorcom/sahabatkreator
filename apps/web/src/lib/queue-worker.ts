/**
 * BullMQ worker — berjalan di dalam proses web via Next.js instrumentation.
 *
 * Memproses job dari queue `@sahabat-kreator/queue`:
 *   - publish-post : publish post terjadwal (delay-based)
 *   - sync         : sinkronkan analytics / inbox sebuah org
 *
 * Dengan worker di dalam proses yang sama, semua logic existing
 * (`publishPost`, `syncOrganizationAnalytics`, `syncOrganizationComments`)
 * langsung dipakai tanpa refactor. Saat platform baru disetujui, cukup tambah
 * publisher di `lib/publishing/` — tidak perlu ubah infra queue.
 *
 * Worker hanya aktif bila REDIS_URL dikonfigurasi dan QUEUE_WORKER_ENABLED
 * tidak diset "false". Aman dijalankan di banyak instance (BullMQ mendistribusikan
 * job; hanya satu worker yang memproses tiap job).
 */
import { Worker } from "bullmq";
import {
    QUEUE_PUBLISH,
    QUEUE_SYNC,
    redisConnectionOptions,
    type PublishPostJobData,
    type SyncJobData,
} from "@sahabat-kreator/queue";
import { publishPost } from "@/lib/publishing/publish-post";
import { syncOrganizationAnalytics } from "@/lib/analytics";
import { syncOrganizationComments } from "@/lib/inbox";

const LOG = (message: string) => console.log(`[queue-worker] ${new Date().toISOString()} ${message}`);

export function startQueueWorkers(): () => Promise<void> {
    const workers: Worker[] = [];

    const publishWorker = new Worker(
        QUEUE_PUBLISH,
        async (job) => {
            const data = job.data as PublishPostJobData;
            LOG(`publish start post=${data.postId} (${data.platform})`);
            const result = await publishPost(data.organizationId, data.postId);
            if (!result.ok) {
                LOG(`publish fail post=${data.postId}: ${result.error}`);
                throw new Error(result.error || "Publish gagal.");
            }
            LOG(`publish done post=${data.postId} → ${result.postUrl || "ok"}`);
        },
        {
            connection: redisConnectionOptions(),
            concurrency: 1,
        },
    );

    const syncWorker = new Worker(
        QUEUE_SYNC,
        async (job) => {
            const data = job.data as SyncJobData;
            LOG(`sync start org=${data.organizationId} type=${data.type}`);
            if (data.type === "analytics") {
                await syncOrganizationAnalytics(data.organizationId);
            } else if (data.type === "inbox") {
                await syncOrganizationComments(data.organizationId);
            }
            LOG(`sync done org=${data.organizationId} type=${data.type}`);
        },
        {
            connection: redisConnectionOptions(),
            concurrency: 1,
        },
    );

    publishWorker.on("failed", (job, err) => {
        LOG(`publish job failed post=${job?.data.postId}: ${err.message}`);
    });
    syncWorker.on("failed", (job, err) => {
        LOG(`sync job failed org=${job?.data.organizationId}: ${err.message}`);
    });

    workers.push(publishWorker, syncWorker);

    return async () => {
        await Promise.all(workers.map((w) => w.close()));
    };
}
