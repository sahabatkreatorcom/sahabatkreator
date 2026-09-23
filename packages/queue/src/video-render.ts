// Video render queue — job render video via Modal.
//
// Berbeda dari publish queue (per-platform, rate limiter ketat): render queue
// tunggal, concurrency rendah, timeout panjang. Tidak ada rate limiter platform
// yang dipatuhi di sini — itu urusan publish queue.
//
// Job data minimal: cuma video_job ID. Worker baca detail dari DB saat claim
// (claim atomik via UPDATE ... WHERE status='queued' RETURNING).
import { type Job, Worker } from "bullmq";
import {
  getRedisConnection,
} from "./connection";
import { processVideoRenderDueJobs, processVideoRenderJob } from "./render-processor";

export const VIDEO_RENDER_QUEUE_NAME = "sk_video_render";

export type VideoRenderJobData = {
  type: "render";
  videoJobId: string;
};

let queue: import("bullmq").Queue<VideoRenderJobData> | null = null;

/** Queue render video (lazy-init) — null bila Redis tidak tersedia */
export function getVideoRenderQueue(): import("bullmq").Queue<VideoRenderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queue) {
    const { Queue } = require("bullmq") as typeof import("bullmq");
    queue = new Queue<VideoRenderJobData>(VIDEO_RENDER_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        // Render berat + Modal preemption — retry cukup banyak.
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return queue;
}

/** Enqueue job render. Return jobId BullMQ atau null bila Redis tidak ada. */
export async function enqueueVideoRender(videoJobId: string): Promise<string | null> {
  const q = getVideoRenderQueue();
  if (!q) return null;
  const job = await q.add(
    "render",
    { type: "render", videoJobId } satisfies VideoRenderJobData,
    {
      // Idempotent: enqueue ulang untuk job DB sama tidak buat duplikat.
      jobId: `render-${videoJobId}`,
    },
  );
  return job.id ?? null;
}

/** Batalkan job render tertunda (video_job dibatalkan user) */
export async function cancelVideoRenderJob(videoJobId: string): Promise<void> {
  const q = getVideoRenderQueue();
  if (!q) return;
  const job = await q.getJob(`render-${videoJobId}`);
  await job?.remove().catch(() => undefined);
}

/** Buat processor worker untuk video render queue */
export function createVideoRenderWorker(): Worker<VideoRenderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<VideoRenderJobData>(
    VIDEO_RENDER_QUEUE_NAME,
    async (job: Job<VideoRenderJobData>) => {
      return processVideoRenderJob(job.data.videoJobId, (percent) => {
        // Update progress ke job event (dashboard BullMQ) — DB update dilakukan
        // processor sendiri agar konsisten saat fallback mode.
        job.updateProgress(percent).catch(() => undefined);
      });
    },
    {
      connection: conn,
      // Render 1080p butuh CPU penuh; paralelisme rendah di server kecil.
      concurrency: 2,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    console.error(
      `[video-render] Job ${job.data.videoJobId} gagal permanen setelah ` +
        `${job.attemptsMade} attempt: ${err.message}`,
    );
    // Tandai failed permanen di DB — diimpor dinamis agar tidak cycle import
    // saat module ini dipakai di luar worker context.
    const { markVideoRenderFailed } = await import("./render-processor");
    await markVideoRenderFailed(
      job.data.videoJobId,
      "retry_exhausted",
      `Gagal setelah ${job.attemptsMade}x percobaan: ${err.message.slice(0, 400)}`,
    );
  });

  return worker;
}

/** Jalankan satu siklus render via DB polling (fallback bila Redis tidak ada) */
export async function runVideoRenderCycle(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  return processVideoRenderDueJobs();
}
