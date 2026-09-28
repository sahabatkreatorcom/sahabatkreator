// Auto-clip queue — job analisis momen (long-form → kandidat klip pendek).
//
// Beda dari video-render/carousel-render: job di queue ini TIDAK render video.
// Output job analisis = daftar kandidat di video_job_segment. Render video
// baru terjadi setelah user pilih kandidat → fanOutSelectedSegments enqueue
// job ke VIDEO_RENDER_QUEUE_NAME biasa (mode single).
//
// Worker job data minimal: cuma video_job ID (mode auto_clip). Detail dibaca
// dari DB saat claim (claim atomik + filter mode — lihat auto-clip-processor).
//
// Kontrak Modal terpisah (RFC §4): adapter getClipperAdapter() pakai app
// `sahabatkreator-clipper` di akun kedua, supaya 100 container concurrency
// Starter tidak dimakan dari job render yang customer tunggu.
import { type Job, Worker } from "bullmq";
import { processAutoClipDueJobs, processAutoClipJob } from "./auto-clip-processor";
import { getRedisConnection } from "./connection";

export const AUTO_CLIP_QUEUE_NAME = "sk_auto_clip";

export type AutoClipJobData = {
  type: "analyze";
  videoJobId: string;
};

let queue: import("bullmq").Queue<AutoClipJobData> | null = null;

/** Queue analisis auto-clip (lazy-init) — null bila Redis tidak tersedia */
export function getAutoClipQueue(): import("bullmq").Queue<AutoClipJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queue) {
    const { Queue } = require("bullmq") as typeof import("bullmq");
    queue = new Queue<AutoClipJobData>(AUTO_CLIP_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        // Ingest 3 jam + transkrip + call AI: sementara bisa menit, retry sedang.
        attempts: 4,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return queue;
}

/** Enqueue job analisis. Return jobId BullMQ atau null bila Redis tidak ada. */
export async function enqueueAutoClip(videoJobId: string): Promise<string | null> {
  const q = getAutoClipQueue();
  if (!q) return null;
  const job = await q.add("analyze", { type: "analyze", videoJobId } satisfies AutoClipJobData, {
    // Idempotent: enqueue ulang untuk job DB sama tidak buat duplikat.
    jobId: `auto-clip-${videoJobId}`,
  });
  return job.id ?? null;
}

/** Batalkan job analisis tertunda (job dibatalkan user) */
export async function cancelAutoClipJob(videoJobId: string): Promise<void> {
  const q = getAutoClipQueue();
  if (!q) return;
  const job = await q.getJob(`auto-clip-${videoJobId}`);
  await job?.remove().catch(() => undefined);
}

/** Buat processor worker untuk auto-clip queue */
export function createAutoClipWorker(): Worker<AutoClipJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<AutoClipJobData>(
    AUTO_CLIP_QUEUE_NAME,
    async (job: Job<AutoClipJobData>) => {
      return processAutoClipJob(job.data.videoJobId, (percent) => {
        // Update progress ke job event (dashboard BullMQ) — DB update dilakukan
        // processor sendiri agar konsisten saat fallback mode.
        job.updateProgress(percent).catch(() => undefined);
      });
    },
    {
      connection: conn,
      // Worker ini HTTP-only (Modal yang kerja berat): paralelisme 2 aman di
      // server kecil, dan Modal concurrency quota ada di akun clipper sendiri.
      concurrency: 2,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    console.error(
      `[auto-clip] Job ${job.data.videoJobId} gagal permanen setelah ` +
        `${job.attemptsMade} attempt: ${err.message}`,
    );
    // Tandai failed permanen di DB — import dinamis agar tidak cycle import.
    const { markAutoClipFailed } = await import("./auto-clip-processor");
    await markAutoClipFailed(
      job.data.videoJobId,
      "retry_exhausted",
      `Gagal setelah ${job.attemptsMade}x percobaan: ${err.message.slice(0, 400)}`,
    );
  });

  return worker;
}

/** Jalankan satu siklus analisis via DB polling (fallback bila Redis tidak ada) */
export async function runAutoClipCycle(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  return processAutoClipDueJobs();
}
