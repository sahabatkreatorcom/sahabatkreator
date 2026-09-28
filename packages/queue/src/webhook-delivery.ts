// Webhook KELUAR — enqueue + deliver ke endpoint org.
//
// Pola sama dengan publish queue: BullMQ bila REDIS_URL ada, fallback DB
// polling (runWebhookDeliveryCycle) bila tidak. Retry exponential oleh BullMQ
// bila delivery throw; attempt counter di-increment per pengiriman.
//
// --- KEAMANAN (audit 27 Sep 2026) ---
// 1. fetch pakai `redirect: "error"` — SSRF guard (ssrf.ts) hanya divalidasi
//    saat create/update endpoint; tanpa ini, endpoint jahat/compromised bisa
//    302-redirect ke alamat internal (169.254.169.254, localhost, dll) saat
//    pengiriman.
// 2. Pengiriman di-claim SECARA ATOMIK (UPDATE ... WHERE status IN
//    queued/retrying RETURNING) supaya BullMQ + polling tidak pernah mengirim
//    delivery yang sama dua kali.
// 3. MAX_DELIVERY_ATTEMPTS → status `failed` terminal, supaya endpoint mati
//    tidak di-retry selamanya.
import { db } from "@sahabatkreator/db";
import { webhookDelivery, webhookEndpoint } from "@sahabatkreator/db/schema";
import { type Job, Queue, Worker } from "bullmq";
import { and, eq, or, sql } from "drizzle-orm";
import { getRedisConnection } from "./connection";

export const WEBHOOK_DELIVERY_QUEUE_NAME = "sk_webhook_delivery";

/** Cap total percobaan (BullMQ + polling digabung) sebelum delivery dinyatakan gagal permanen. */
export const MAX_DELIVERY_ATTEMPTS = 8;

export type WebhookDeliveryJobData = {
  deliveryId: string;
};

const queues = new Map<string, Queue<WebhookDeliveryJobData>>();

function getDeliveryQueue(): Queue<WebhookDeliveryJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  let q = queues.get(WEBHOOK_DELIVERY_QUEUE_NAME);
  if (!q) {
    q = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        // 30s, 2m, 8m, 30m, 2j (sama dengan publish queue)
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    queues.set(WEBHOOK_DELIVERY_QUEUE_NAME, q);
  }
  return q;
}

/**
 * Enqueue satu delivery. Best-effort: return null bila Redis tidak ada
 * (fallback polling yang akan menjemput). Error ditelan — webhook keluar
 * tidak boleh membatalkan operasi utama (pola notifyOrganization).
 */
export async function enqueueWebhookDelivery(deliveryId: string): Promise<string | null> {
  try {
    const queue = getDeliveryQueue();
    if (!queue) return null;
    const job = await queue.add("deliver", { deliveryId });
    return job.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Deliver satu record: fetch POST dengan HMAC, update status.
 *
 * Claim atomik di awal: hanya satu proses (worker BullMQ atau cycle polling)
 * yang boleh memproses delivery ini. `attempt` di-increment sebagai bagian
 * claim, sehingga DB jadi satu-satunya counter — tidak ada race arithmetic
 * di memori.
 */
export async function deliverWebhook(deliveryId: string): Promise<void> {
  // Claim: kalau status terminal (delivered/failed) atau sedang diproses
  // proses lain, RETURNING kosong → batal. attempt naik di sini.
  const claimed = await db
    .update(webhookDelivery)
    .set({ status: "retrying", attempt: sql`${webhookDelivery.attempt} + 1` })
    .where(
      and(
        eq(webhookDelivery.id, deliveryId),
        or(eq(webhookDelivery.status, "queued"), eq(webhookDelivery.status, "retrying")),
      ),
    )
    .returning();
  const delivery = claimed[0];
  if (!delivery) return;

  // Cap percobaan → gagal permanen. Endpoint mati tidak boleh di-retry selamanya.
  if (delivery.attempt > MAX_DELIVERY_ATTEMPTS) {
    await db
      .update(webhookDelivery)
      .set({
        status: "failed",
        responseBody: `Batas ${MAX_DELIVERY_ATTEMPTS} percobaan tercapai`,
      })
      .where(eq(webhookDelivery.id, deliveryId));
    return;
  }

  const [endpoint] = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, delivery.endpointId))
    .limit(1);
  // Endpoint hilang/nonaktif → tandai gagal permanen, jangan retry
  if (!endpoint?.isActive || endpoint.revokedAt) {
    await db
      .update(webhookDelivery)
      .set({ status: "failed", responseBody: "Endpoint tidak aktif" })
      .where(eq(webhookDelivery.id, deliveryId));
    return;
  }

  const { signWebhookPayload } = await import("./sign");
  const body = JSON.stringify({
    event: delivery.event,
    deliveredAt: new Date().toISOString(),
    data: delivery.payload,
  });

  const res = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sk-event": delivery.event,
      "x-sk-signature": signWebhookPayload(body, endpoint.secretEnc),
      "x-sk-delivery": deliveryId,
    },
    // WAJIB: tanpa ini fetch mengikuti 302 → SSRF bypass ke alamat internal
    // (SSRF guard hanya divalidasi saat endpoint dibuat, bukan saat kirim).
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  const responseText = await res.text();

  if (res.ok) {
    await db
      .update(webhookDelivery)
      .set({
        status: "delivered",
        responseStatus: String(res.status),
        responseBody: responseText.slice(0, 500) || null,
        deliveredAt: new Date(),
      })
      .where(eq(webhookDelivery.id, deliveryId));
    return;
  }

  // Gagal → catat response, throw agar BullMQ retry dengan backoff.
  // status tetap "retrying" (sudah di-set saat claim).
  await db
    .update(webhookDelivery)
    .set({
      responseStatus: String(res.status),
      responseBody: responseText.slice(0, 500) || null,
    })
    .where(eq(webhookDelivery.id, deliveryId));
  throw new Error(`Webhook ${res.status}: ${responseText.slice(0, 200)}`);
}

/** Worker BullMQ — dipasang di apps/worker. */
export function createWebhookDeliveryWorker(): Worker<WebhookDeliveryJobData> | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  return new Worker<WebhookDeliveryJobData>(
    WEBHOOK_DELIVERY_QUEUE_NAME,
    async (job: Job<WebhookDeliveryJobData>) => {
      await deliverWebhook(job.data.deliveryId);
    },
    { connection: conn, concurrency: 10 },
  );
}

/**
 * Fallback DB polling (tanpa Redis). Ambil delivery belum selesai, kirim
 * langsung, skip yang masih dalam jendela backoff. Idempoten — aman dijalankan
 * berulang.
 */
export async function runWebhookDeliveryCycle(): Promise<void> {
  const due = await db
    .select({ id: webhookDelivery.id })
    .from(webhookDelivery)
    .where(
      and(
        or(eq(webhookDelivery.status, "queued"), eq(webhookDelivery.status, "retrying")),
        // Backoff sederhana: attempt ke-n menunggu ~30s * 2^n
        sql`${webhookDelivery.updatedAt} + (${webhookDelivery.attempt} * interval '30 second') < now()`,
      ),
    )
    .limit(20);
  for (const row of due) {
    try {
      await deliverWebhook(row.id);
    } catch {
      // error sudah tercatat di deliverWebhook
    }
  }
}
