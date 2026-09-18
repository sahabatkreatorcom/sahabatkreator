// Auto-reply AI queue — delayed job (BullMQ) + fallback DB polling.
//
// Arsitektur sama dengan reminder.ts:
// - Redis tersedia → BullMQ delayed job (delay = rule.action.delayMinutes)
// - Redis kosong   → worker fallback polling automation_log.due_at
//
// Job data minimal (hanya logId): seluruh konteks dimuat dari DB saat eksekusi
// oleh processAutoReplyJob — idempoten & tahan race BullMQ-vs-fallback (claim
// atomik di dalamnya).

import { db } from "@sahabatkreator/db";
import { automationLog } from "@sahabatkreator/db/schema";
import { processAutoReplyJob } from "@sahabatkreator/publishing";
import { Worker } from "bullmq";
import { and, eq, lte } from "drizzle-orm";
import { getRedisConnection } from "./connection";

export const AUTO_REPLY_QUEUE_NAME = "sk_auto_reply";

export type AutoReplyJobData = {
  type: "auto-reply";
  /** automation_log.id — baris status "pending" dengan due_at terisi */
  logId: string;
};

/**
 * Enqueue delayed auto-reply job.
 * dueAt sudah ditulis ke automation_log oleh caller (processAutomation);
 * di sini hanya mendaftarkan job BullMQ.
 * Return true bila job masuk Redis; false → fallback polling.
 */
export async function enqueueAutoReply(logId: string, dueAt: Date): Promise<boolean> {
  const conn = getRedisConnection();
  if (!conn) return false; // fallback polling via kolom due_at

  const { Queue } = await import("bullmq");
  const queue = new Queue<AutoReplyJobData>(AUTO_REPLY_QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  const delay = Math.max(dueAt.getTime() - Date.now(), 0);
  await queue.add(
    "auto-reply",
    { type: "auto-reply", logId } satisfies AutoReplyJobData,
    { jobId: `auto-reply-${logId}`, delay },
  );
  await queue.close();
  return true;
}

/** Batalkan job auto-reply tertunda (rule dimatikan / item dibalas manual) */
export async function cancelAutoReply(logId: string): Promise<void> {
  const conn = getRedisConnection();
  if (!conn) return;
  const { Queue } = await import("bullmq");
  const queue = new Queue<AutoReplyJobData>(AUTO_REPLY_QUEUE_NAME, { connection: conn });
  const job = await queue.getJob(`auto-reply-${logId}`);
  await job?.remove().catch(() => undefined);
  await queue.close();
}

/** Buat worker BullMQ untuk job auto-reply (dipanggil apps/worker saat mode Redis) */
export function createAutoReplyWorker(): Worker<AutoReplyJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<AutoReplyJobData>(
    AUTO_REPLY_QUEUE_NAME,
    async (job) => {
      // processAutoReplyJob menulis status final ke automation_log (DB = source of
      // truth) & meng-claim idempoten — error di dalamnya sudah ditangani, jadi
      // tidak perlu throw retry (attempt 2 akan no-op karena claim habis).
      // Throw tak-terduga (crash) tetap propagate ke BullMQ untuk retry.
      return await processAutoReplyJob(job.data.logId);
    },
    { connection: conn, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[auto-reply] job ${job?.id ?? "?"} gagal: ${err.message}`);
  });

  return worker;
}

/**
 * Satu siklus fallback (tanpa Redis): proses semua job pending yang sudah due.
 * Idempoten — claim atomik ada di processAutoReplyJob (SET due_at = NULL
 * WHERE status='pending' AND due_at IS NOT NULL).
 */
export async function runAutoReplyCycle(): Promise<{ processed: number; sent: number }> {
  const due = await db
    .select({ id: automationLog.id })
    .from(automationLog)
    .where(
      and(eq(automationLog.status, "pending"), lte(automationLog.dueAt, new Date())),
    )
    .limit(50);

  let processed = 0;
  let sent = 0;
  for (const row of due) {
    try {
      const result = await processAutoReplyJob(row.id);
      processed++;
      if (result.status === "sent") sent++;
    } catch (error) {
      console.error(`[auto-reply] log=${row.id} gagal:`, error);
    }
  }
  return { processed, sent };
}
