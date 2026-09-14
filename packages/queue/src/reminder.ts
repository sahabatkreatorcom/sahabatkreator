// Reminder push untuk post manual (M18) — queue job "post-reminder" + fallback DB polling.
//
// Post bertipe platform "manual" tidak dipublikasi otomatis (pipeline melempar
// PublishError "platform_manual"). Sebagai gantinya, user bisa mengaktifkan
// pengingat: web push dikirim `minutesBefore` menit sebelum scheduledAt ke
// semua member org dengan subscription aktif.
//
// Arsitektur sama dengan publish job:
// - Redis tersedia → BullMQ delayed job (queue khusus, tanpa rate limiter ketat)
// - Redis kosong   → worker fallback polling kolom post_group.reminder_at

import { db, pushToOrganization } from "@sahabatkreator/db";
import { postGroup } from "@sahabatkreator/db/schema";
import { Worker } from "bullmq";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getRedisConnection } from "./connection";

/** Nama queue reminder — prefix sk_ konsisten dengan queue publish */
export const REMINDER_QUEUE_NAME = "sk_post_reminder";

export type ReminderJobData = {
  type: "post-reminder";
  postGroupId: string;
  organizationId: string;
  /** Waktu tayang (untuk isi body push) */
  scheduledAt: string;
  /** Judul/konten post untuk body push */
  content: string;
};

/**
 * Kirim push pengingat ke semua member org (owner/admin/editor).
 * Best-effort — return jumlah terkirim.
 */
export async function sendPostReminder(job: {
  organizationId: string;
  content: string;
  scheduledAt: string | Date;
}): Promise<number> {
  const scheduled = new Date(job.scheduledAt);
  const timeLabel = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(scheduled);
  const contentLabel = job.content.trim() ? job.content.trim().slice(0, 120) : "(tanpa caption)";

  return pushToOrganization(
    job.organizationId,
    "post_published", // kategori preferensi paling dekat: event post tayang
    {
      title: "Pengingat Post Manual",
      body: `"${contentLabel}" dijadwalkan tayang ${timeLabel} — saatnya posting manual!`,
      url: "/calendar",
      tag: `post-reminder:${job.organizationId}`,
    },
  );
}

/**
 * Proses satu job reminder: kirim push lalu tandai reminderAt = null
 * (agar fallback polling tidak mengirim ulang).
 */
export async function processPostReminder(postGroupId: string): Promise<number> {
  // Claim atomik: hanya kirim bila reminder_at masih terisi (belum dikirim/dibatalkan).
  // WHERE reminder_at IS NOT NULL membuat race BullMQ-vs-fallback aman (satu pemenang).
  const [group] = await db
    .update(postGroup)
    .set({ reminderAt: null })
    .where(and(eq(postGroup.id, postGroupId), isNotNull(postGroup.reminderAt)))
    .returning({
      organizationId: postGroup.organizationId,
      content: postGroup.content,
      scheduledAt: postGroup.scheduledAt,
    });
  if (!group?.scheduledAt) return 0;

  const sent = await sendPostReminder({
    organizationId: group.organizationId,
    content: group.content,
    scheduledAt: group.scheduledAt,
  });
  console.log(`[post-reminder] group=${postGroupId} sent=${sent}`);
  return sent;
}

/**
 * Enqueue job reminder delayed (BullMQ). Simpan reminderAt ke DB agar:
 * - UI bisa menampilkan status "pengingat aktif"
 * - Worker fallback bisa polling tanpa Redis.
 * Return true bila job masuk Redis; false → fallback polling yang menangkap.
 */
export async function enqueuePostReminder(
  postGroupId: string,
  organizationId: string,
  content: string,
  scheduledAt: Date,
  minutesBefore: number,
): Promise<boolean> {
  const reminderAt = new Date(scheduledAt.getTime() - minutesBefore * 60_000);

  // Simpan ke DB (single source status — dipakai UI & fallback worker)
  await db.update(postGroup).set({ reminderAt }).where(eq(postGroup.id, postGroupId));

  const conn = getRedisConnection();
  if (!conn) return false; // fallback polling via kolom reminder_at

  const { Queue } = await import("bullmq");
  const queue = new Queue<ReminderJobData>(REMINDER_QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  const delay = Math.max(reminderAt.getTime() - Date.now(), 0);
  await queue.add(
    "post-reminder",
    {
      type: "post-reminder",
      postGroupId,
      organizationId,
      scheduledAt: scheduledAt.toISOString(),
      content,
    } satisfies ReminderJobData,
    { jobId: `reminder:${postGroupId}`, delay },
  );
  await queue.close();
  return true;
}

/** Batalkan job reminder tertunda (post dihapus/dijadwalkan ulang) + reset kolom */
export async function cancelPostReminder(postGroupId: string): Promise<void> {
  await db.update(postGroup).set({ reminderAt: null }).where(eq(postGroup.id, postGroupId));

  const conn = getRedisConnection();
  if (!conn) return;
  const { Queue } = await import("bullmq");
  const queue = new Queue<ReminderJobData>(REMINDER_QUEUE_NAME, { connection: conn });
  const job = await queue.getJob(`reminder:${postGroupId}`);
  await job?.remove().catch(() => undefined);
  await queue.close();
}

/**
 * Buat worker BullMQ untuk job reminder (dipanggil apps/worker saat mode Redis).
 */
export function createReminderWorker(): Worker<ReminderJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker<ReminderJobData>(
    REMINDER_QUEUE_NAME,
    async (job) => {
      const sent = await processPostReminder(job.data.postGroupId);
      return sent;
    },
    { connection: conn, concurrency: 4 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[post-reminder] job ${job?.id ?? "?"} gagal: ${err.message}`);
  });

  return worker;
}

/**
 * Satu siklus fallback (tanpa Redis): kirim semua reminder yang sudah due.
 * Idempotent via claim atomik (SET reminder_at = NULL WHERE id = ... AND reminder_at <= now).
 */
export async function runReminderCycle(): Promise<{ sent: number }> {
  const claimed = await db
    .update(postGroup)
    .set({ reminderAt: null })
    .where(and(isNotNull(postGroup.reminderAt), lte(postGroup.reminderAt, new Date())))
    .returning({
      id: postGroup.id,
      organizationId: postGroup.organizationId,
      content: postGroup.content,
      scheduledAt: postGroup.scheduledAt,
    });

  let sent = 0;
  for (const group of claimed) {
    if (!group.scheduledAt) continue;
    try {
      sent += await sendPostReminder({
        organizationId: group.organizationId,
        content: group.content,
        scheduledAt: group.scheduledAt,
      });
      console.log(`[post-reminder] group=${group.id} sent (fallback)`);
    } catch (error) {
      console.error(`[post-reminder] group=${group.id} gagal:`, error);
    }
  }
  return { sent };
}
