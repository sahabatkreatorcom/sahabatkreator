// Processor & enqueue helper BullMQ — publish job + poll job

import {
  claimPostById,
  executePublish,
  PublishError,
  pollPost,
  resetToScheduled,
} from "@sahabatkreator/publishing";
import { type Job, Worker } from "bullmq";
import {
  getPublishQueue,
  getRedisConnection,
  type JobData,
  platformRateLimiter,
  queueNameForPlatform,
} from "./connection";

/**
 * Enqueue job publish satu post. Delayed hingga scheduledAt bila di masa depan.
 * Return jobId bila sukses; null bila Redis tidak tersedia (caller fallback DB polling).
 */
export async function enqueuePublish(
  postId: string,
  platform: string,
  scheduledAt?: Date | null,
): Promise<string | null> {
  const queue = getPublishQueue(platform);
  if (!queue) return null;
  const delay =
    scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt.getTime() - Date.now() : 0;
  const job = await queue.add("publish", { type: "publish", postId, platform } satisfies JobData, {
    // Idempotent — duplikat enqueue di-dedupe BullMQ. NOTE: jobId tidak boleh
    // mengandung ":" (reserved untuk flow BullMQ, harus tepat 3 segmen) — pakai "-".
    jobId: `publish-${postId}`,
    delay,
  });
  return job.id ?? null;
}

/** Enqueue job poll post in-flight (dipanggil setelah publish return "processing") */
export async function enqueuePoll(
  postId: string,
  platform: string,
  firstPollDelayMs = 20_000,
): Promise<string | null> {
  const queue = getPublishQueue(platform);
  if (!queue) return null;
  const job = await queue.add("poll", { type: "poll", postId, platform } satisfies JobData, {
    jobId: `poll-${postId}`,
    delay: firstPollDelayMs,
  });
  return job.id ?? null;
}

/** Batalkan job publish tertunda (post dihapus / dijadwalkan ulang) */
export async function cancelPublishJob(postId: string, platform: string): Promise<void> {
  const queue = getPublishQueue(platform);
  if (!queue) return;
  const job = await queue.getJob(`publish-${postId}`);
  await job?.remove().catch(() => undefined);
}

/**
 * Buat processor worker BullMQ untuk satu platform.
 * - Job "publish": claim atomik → executePublish (retryable throw → BullMQ backoff)
 * - Job "poll": pollPost → masih processing → re-enqueue poll berikutnya
 */
export function createPublishWorker(platform: string): Worker<JobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  const queue = getPublishQueue(platform);
  if (!queue) return null;

  const worker = new Worker<JobData>(
    queueNameForPlatform(platform),
    async (job: Job<JobData>) => {
      const { data } = job;
      if (data.type === "publish") {
        const claimed = await claimPostById(data.postId);
        if (!claimed) {
          // Sudah diclaim runner lain (race dengan DB fallback) — job selesai sukses
          return "already-claimed";
        }
        try {
          const result = await executePublish(data.postId);
          if (result === "processing") {
            // Platform sedang memproses → jadwalkan poll
            await enqueuePoll(data.postId, data.platform);
          }
          return result;
        } catch (error) {
          // Retryable error dari executePublish → throw agar BullMQ retry dengan backoff.
          // Post kembali "scheduled" untuk attempt berikutnya.
          await resetToScheduled(data.postId);
          throw error;
        }
      }

      // Poll job
      const status = await pollPost(data.postId);
      if (status === "processing") {
        // Masih diproses platform — re-enqueue poll (interval naik: 20s → 40s → 80s...)
        const attempt = job.attemptsMade + 1;
        const nextDelay = Math.min(20_000 * 2 ** attempt, 10 * 60_000);
        await queue.add(
          "poll",
          { type: "poll", postId: data.postId, platform: data.platform } satisfies JobData,
          {
            jobId: `poll-${data.postId}-${Date.now()}`, // jobId unik tiap round
            delay: nextDelay,
          },
        );
      }
      return status;
    },
    {
      connection: conn,
      concurrency: 2, // 2 job paralel per platform (limiter queue tetap jalan)
      // Rate limiter per platform (BullMQ v6: limiter di WorkerOptions)
      limiter: platformRateLimiter(platform),
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return; // masih akan retry
    // Attempt habis → tandai post failed permanen
    if (job.data.type === "publish") {
      const { postId } = job.data;
      // executePublish sudah tidak menandai failed utk retryable; lakukan di sini (final)
      console.error(
        `[queue] Post ${postId} gagal permanen setelah ${job.attemptsMade} attempt: ${err.message}`,
      );
      const { markPostFailed } = await import("./mark-failed");
      await markPostFailed(
        postId,
        "retry_exhausted",
        `Gagal setelah ${job.attemptsMade}x percobaan: ${err.message.slice(0, 400)}`,
      );
    }
  });

  return worker;
}

export { PublishError };
