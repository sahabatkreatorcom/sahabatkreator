// Carousel render queue — job render slide carousel via Modal (Pillow).
//
// Sama arsitektur dengan video-render.ts, tapi Pillow ringan → concurrency
// lebih tinggi (4 vs 2) dan timeout lebih pendek. Tidak ada rate limiter
// platform di sini; publish carousel adalah urusan publish queue terpisah.
//
// Job data minimal: cuma carousel_job ID. Worker baca detail dari DB saat
// claim (claim atomik via UPDATE ... WHERE status='queued' RETURNING).
import { type Job, Worker } from "bullmq";
import { processCarouselDueJobs, processCarouselRenderJob } from "./carousel-processor";
import { getRedisConnection } from "./connection";

export const CAROUSEL_RENDER_QUEUE_NAME = "sk_carousel_render";

export type CarouselRenderJobData = {
  type: "render";
  carouselJobId: string;
};

let queue: import("bullmq").Queue<CarouselRenderJobData> | null = null;

/** Queue render carousel (lazy-init) — null bila Redis tidak tersedia */
export function getCarouselRenderQueue(): import("bullmq").Queue<CarouselRenderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!queue) {
    const { Queue } = require("bullmq") as typeof import("bullmq");
    queue = new Queue<CarouselRenderJobData>(CAROUSEL_RENDER_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        // Pillow cepat (detik, bukan menit) tapi stock download bisa gagal
        // sesekali — retry sedang sudah cukup.
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
  }
  return queue;
}

/** Enqueue job render carousel. Return jobId BullMQ atau null bila Redis tidak ada. */
export async function enqueueCarouselRender(carouselJobId: string): Promise<string | null> {
  const q = getCarouselRenderQueue();
  if (!q) return null;
  const job = await q.add(
    "render",
    { type: "render", carouselJobId } satisfies CarouselRenderJobData,
    {
      // Idempotent: enqueue ulang untuk job DB sama tidak buat duplikat.
      jobId: `carousel-render-${carouselJobId}`,
    },
  );
  return job.id ?? null;
}

/** Batalkan job carousel tertunda (job dibatalkan user) */
export async function cancelCarouselRenderJob(carouselJobId: string): Promise<void> {
  const q = getCarouselRenderQueue();
  if (!q) return;
  const job = await q.getJob(`carousel-render-${carouselJobId}`);
  await job?.remove().catch(() => undefined);
}

/** Buat processor worker untuk carousel render queue */
export function createCarouselRenderWorker(): Worker<CarouselRenderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<CarouselRenderJobData>(
    CAROUSEL_RENDER_QUEUE_NAME,
    async (job: Job<CarouselRenderJobData>) => {
      return processCarouselRenderJob(job.data.carouselJobId, (percent) => {
        // Update progress ke job event (dashboard BullMQ) — DB update dilakukan
        // processor sendiri agar konsisten saat fallback mode.
        job.updateProgress(percent).catch(() => undefined);
      });
    },
    {
      connection: conn,
      // Pillow ringan (CPU share kecil di Modal) — paralelisme lebih tinggi
      // dari video render aman di server kecil.
      concurrency: 4,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    console.error(
      `[carousel-render] Job ${job.data.carouselJobId} gagal permanen setelah ` +
        `${job.attemptsMade} attempt: ${err.message}`,
    );
    // Tandai failed permanen di DB — import dinamis agar tidak cycle import.
    const { markCarouselFailed } = await import("./carousel-processor");
    await markCarouselFailed(
      job.data.carouselJobId,
      "retry_exhausted",
      `Gagal setelah ${job.attemptsMade}x percobaan: ${err.message.slice(0, 400)}`,
    );
  });

  return worker;
}

/** Jalankan satu siklus render via DB polling (fallback bila Redis tidak ada) */
export async function runCarouselRenderCycle(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  return processCarouselDueJobs();
}
