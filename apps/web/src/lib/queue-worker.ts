/**
 * BullMQ worker — berjalan di dalam proses web via Next.js instrumentation.
 *
 * Memproses job dari queue `@sahabat-kreator/queue`:
 *   - publish-post : publish post terjadwal (delay-based)
 *   - sync         : sinkronkan analytics / inbox sebuah org
 *   - stale-post-cleanup: reset post stuck PUBLISHING > 10 menit
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
import { Queue, Worker } from "bullmq";
import { randomUUID } from "node:crypto";
import {
    QUEUE_PUBLISH,
    QUEUE_SYNC,
    QUEUE_STALE_CLEANUP,
    QUEUE_TIKTOK_CHECK,
    redisConnectionOptions,
    type PublishPostJobData,
    type SyncJobData,
    type StaleCleanupJobData,
    type TikTokCheckJobData,
    enqueueStaleCleanup,
    enqueueTikTokStatusCheck,
} from "@sahabat-kreator/queue";
import { publishPost } from "@/lib/publishing/publish-post";
import { syncOrganizationAnalytics } from "@/lib/analytics";
import { syncOrganizationComments } from "@/lib/inbox";
import { db, schema } from "@sahabat-kreator/db";
import { and, eq, lte } from "drizzle-orm";
import { decryptToken } from "@/lib/token-encryption";
import { humanizeTikTokError } from "@/lib/publishing/tiktok";
import { logActivity } from "@/lib/activity-log";

const LOG = (message: string) => console.log(`[queue-worker] ${new Date().toISOString()} ${message}`);
const TIKTOK_PENDING_PREFIX = "tiktok_pending:";
const TIKTOK_API_URL = "https://open.tiktokapis.com/v2";

export async function startQueueWorkers(): Promise<() => Promise<void>> {
    const workers: Worker[] = [];

    const publishWorker = new Worker(
        QUEUE_PUBLISH,
        async (job) => {
            const data = job.data as PublishPostJobData;
            LOG(`publish start post=${data.postId} (${data.platform})`);
            const result = await publishPost(data.organizationId, data.postId);
            if (!result.ok) {
                // publishPost sudah set FAILED + insert publish_error sendiri.
                // Jangan throw — itu akan memicu retry berkali-kali yang sia-sia.
                LOG(`publish fail post=${data.postId}: ${result.error}`);
                return;
            }
            LOG(`publish done post=${data.postId} → ${result.postUrl || "ok"}`);
        },
        {
            connection: redisConnectionOptions(),
            concurrency: 3,
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
            concurrency: 2,
        },
    );

    // Stale post cleanup — repeatable every 60s via BullMQ scheduler
    const staleCleanupWorker = new Worker(
        QUEUE_STALE_CLEANUP,
        async () => {
            LOG("stale-cleanup tick");
            try {
                const cutoff = new Date(Date.now() - 10 * 60 * 1000);
                const stale = await db.query.post.findMany({
                    where: and(
                        eq(schema.post.status, "PUBLISHING"),
                        lte(schema.post.updatedAt, cutoff),
                    ),
                    with: { socialAccount: true },
                });

                for (const post of stale) {
                    // Skip TikTok pending — those are async and need much longer
                    if (
                        post.platform === "TIKTOK" &&
                        post.platformPostId?.startsWith(TIKTOK_PENDING_PREFIX)
                    ) {
                        await checkAndResolveTikTokPost(post);
                        continue;
                    }

                    // Other platforms: reset to FAILED after threshold
                    await db.insert(schema.publishError)
                        .values({
                            id: randomUUID(),
                            postId: post.id,
                            platform: (post.platform ?? "MANUAL") as "INSTAGRAM" | "INSTAGRAM_PAGE" | "FACEBOOK" | "TIKTOK" | "YOUTUBE" | "PINTEREST" | "GOOGLE_BUSINESS" | "LINKEDIN" | "BLUESKY" | "THREADS" | "MANUAL",
                            errorCode: "STALE_PUBLISHING_TIMEOUT",
                            errorRaw: `Post stuck di status PUBLISHING selama >10 menit (${post.platform}).`,
                            errorHuman: `Publikasi ${post.platform} gagal (timeout).`,
                            suggestion: "Coba publish ulang dari dashboard.",
                            occurredAt: new Date(),
                        });
                    await db.update(schema.post)
                        .set({ status: "FAILED", updatedAt: new Date() })
                        .where(eq(schema.post.id, post.id));
                    LOG(`stale-reset post=${post.id} platform=${post.platform}`);
                }
            } catch (e) {
                LOG(`stale-cleanup error: ${e instanceof Error ? e.message : e}`);
            }
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
    staleCleanupWorker.on("failed", (job, err) => {
        LOG(`stale-cleanup job failed: ${err.message}`);
    });

    const MAX_TIKTOK_CHECK_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// TikTok status check worker — delayed job setelah publish photo
// ---------------------------------------------------------------------------

const tiktokCheckWorker = new Worker(
    QUEUE_TIKTOK_CHECK,
    async (job) => {
        const data = job.data as TikTokCheckJobData;
        LOG(`tiktok-check start post=${data.postId} attempt=${data.attempt}`);

        const post = await db.query.post.findFirst({
            where: eq(schema.post.id, data.postId),
            with: {
                socialAccount: true,
                media: { with: { media: true }, orderBy: (pm, { asc }) => [asc(pm.order)] },
            },
        });

        if (!post || !post.socialAccount) {
            LOG(`tiktok-check post=${data.postId} not found or no social account`);
            return;
        }

        // Sudah resolved oleh proses lain (mis. user manual / stale cleanup)
        if (post.status !== "PUBLISHING") {
            LOG(`tiktok-check post=${data.postId} status=${post.status} — skipping`);
            return;
        }

        const accessToken = decryptToken(post.socialAccount.accessToken);

        try {
            const res = await fetch(`${TIKTOK_API_URL}/post/publish/status/fetch/`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ publish_id: data.publishId }),
            });
            const resData = await res.json();
            const status = resData.data?.status;

            if (status === "PUBLISH_COMPLETE") {
                const ids = resData.data?.publiclyAvailablePostId;
                const publicId = Array.isArray(ids) && ids.length > 0 ? String(ids[0]).trim() : null;
                const accountName = post.socialAccount.name || "user";
                const hasVideo = post.media.some((pm) => pm.media.mimeType?.startsWith("video/"));
                const tiktokUrl = publicId
                    ? `https://www.tiktok.com/@${accountName}/${hasVideo ? "video" : "photo"}/${publicId}`
                    : null;

                await db.update(schema.post)
                    .set({
                        status: "PUBLISHED",
                        publishedAt: new Date(),
                        platformPostId: publicId || post.platformPostId,
                        externalUrl: tiktokUrl,
                    })
                    .where(eq(schema.post.id, post.id));
                await logActivity(
                    post.organizationId,
                    "post.published",
                    { type: "post", id: post.id, name: (post.caption || "").slice(0, 100) },
                    { platform: "TIKTOK", platformPostId: publicId },
                );
                LOG(`tiktok-check resolved post=${data.postId} publicId=${publicId}`);
            } else if (status === "FAILED") {
                const failedReason = resData.data?.fail_reason || "unknown";
                await db.update(schema.post)
                    .set({ status: "FAILED" })
                    .where(eq(schema.post.id, post.id));
                await db.insert(schema.publishError).values({
                    id: randomUUID(),
                    postId: post.id,
                    platform: "TIKTOK",
                    errorCode: `TIKTOK_FAILED:${failedReason}`,
                    errorRaw: JSON.stringify(resData),
                    errorHuman: humanizeTikTokError(failedReason),
                    occurredAt: new Date(),
                });
                await logActivity(
                    post.organizationId,
                    "post.failed",
                    { type: "post", id: post.id, name: (post.caption || "").slice(0, 100) },
                    { platform: "TIKTOK", error: failedReason },
                );
                LOG(`tiktok-check failed post=${data.postId} reason=${failedReason}`);
            } else {
                // Masih pending — enqueue lagi jika belum max attempts
                if (data.attempt < MAX_TIKTOK_CHECK_ATTEMPTS) {
                    await enqueueTikTokStatusCheck(
                        data.postId,
                        data.organizationId,
                        data.publishId,
                        data.attempt + 1,
                    );
                    LOG(`tiktok-check still pending post=${data.postId} — retry attempt ${data.attempt + 1}`);
                } else {
                    LOG(`tiktok-check max attempts reached post=${data.postId} — leaving as PUBLISHING`);
                }
            }
        } catch (e) {
            LOG(`tiktok-check error post=${data.postId}: ${e instanceof Error ? e.message : e}`);
            // Network error — enqueue lagi jika belum max attempts
            if (data.attempt < MAX_TIKTOK_CHECK_ATTEMPTS) {
                await enqueueTikTokStatusCheck(
                    data.postId,
                    data.organizationId,
                    data.publishId,
                    data.attempt + 1,
                );
            }
        }
    },
    {
        connection: redisConnectionOptions(),
        concurrency: 2,
    },
);

tiktokCheckWorker.on("failed", (job, err) => {
    LOG(`tiktok-check job failed post=${job?.data.postId}: ${err.message}`);
});

workers.push(publishWorker, syncWorker, staleCleanupWorker, tiktokCheckWorker);

    // Start the repeatable stale-cleanup job (once — BullMQ keeps the schedule)
    await enqueueStaleCleanup();

    return async () => {
        await Promise.all(workers.map((w) => w.close()));
    };
}

// ---------------------------------------------------------------------------
// TikTok pending resolver — called by the stale-cleanup worker
// ---------------------------------------------------------------------------

async function checkAndResolveTikTokPost(post: {
    id: string;
    platformPostId: string | null;
    organizationId: string;
    caption: string | null;
    postType: string | null;
    socialAccount: { accessToken: string; name: string | null } | null;
}) {
    if (!post.platformPostId?.startsWith(TIKTOK_PENDING_PREFIX) || !post.socialAccount) return;

    const publishId = post.platformPostId.replace(TIKTOK_PENDING_PREFIX, "");
    const accessToken = decryptToken(post.socialAccount.accessToken);

    try {
        const res = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ publish_id: publishId }),
        });
        const data = await res.json();
        const status = data.data?.status;

        if (status === "PUBLISH_COMPLETE") {
            const ids = data.data?.publiclyAvailablePostId;
            const publicId = Array.isArray(ids) && ids.length > 0 ? String(ids[0]) : null;
            const accountName = post.socialAccount.name || "user";
            const isPhoto = post.postType === "CAROUSEL";
            await db.update(schema.post)
                .set({
                    status: "PUBLISHED",
                    publishedAt: new Date(),
                    platformPostId: publicId || post.platformPostId,
                    externalUrl: publicId
                        ? `https://www.tiktok.com/@${accountName}/${isPhoto ? "photo" : "video"}/${publicId}`
                        : null,
                })
                .where(eq(schema.post.id, post.id));
            LOG(`tiktok resolved post=${post.id} publicId=${publicId}`);
        }
        // else: still pending — leave as PUBLISHING
    } catch {
        // network error; retry next tick
    }
}
