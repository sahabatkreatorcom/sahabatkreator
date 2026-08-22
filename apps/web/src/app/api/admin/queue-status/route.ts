import { withAdmin, json } from "@/lib/api";
import { getQueueStatus } from "@sahabat-kreator/queue";
import { QUEUE_PUBLISH, QUEUE_SYNC, QUEUE_STALE_CLEANUP } from "@sahabat-kreator/queue";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/queue-status — ringkasan antrian BullMQ per queue.
 */
export const GET = withAdmin(async () => {
    if (!process.env.REDIS_URL) {
        return json({ redisConfigured: false, queues: {} });
    }

    const [publish, sync, stale] = await Promise.all([
        getQueueStatus(QUEUE_PUBLISH),
        getQueueStatus(QUEUE_SYNC),
        getQueueStatus(QUEUE_STALE_CLEANUP),
    ]);

    return json({
        redisConfigured: true,
        queues: {
            publish: publish,
            sync: sync,
            staleCleanup: stale,
        },
    });
});
