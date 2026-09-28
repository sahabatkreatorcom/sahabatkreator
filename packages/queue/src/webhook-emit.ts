// Webhook keluar — emit event ke endpoint org yang berlangganan.
//
// Dipanggil dari server (route handler) dan queue processor (render complete).
// Fire-and-forget: error ditelan, tidak boleh membatalkan operasi utama
// (pola notifyOrganization di packages/db/src/notify.ts).
// Dipasang di package ini (bukan apps/server) supaya worker juga bisa pakai.

import { randomUUID } from "node:crypto";
import { db } from "@sahabatkreator/db";
import { type WebhookEvent, webhookDelivery, webhookEndpoint } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { enqueueWebhookDelivery } from "./webhook-delivery";

/**
 * Emit event ke seluruh endpoint org yang berlangganan event tersebut.
 * Membuat record webhook_delivery (status queued) + enqueue pengiriman.
 * Idempoten via uniqueIndex(endpointId, event, payload).
 *
 * Catatan error: hanya unique-constraint (23505) yang ditelan dengan sengaja
 * (= duplikat event, idempoten). Error DB lain (koneksi putus, disk penuh,
 * schema drift) TIDAK boleh ditelan diam-diam — webhook bocor tanpa jejak.
 * Error tersebut di-log dan di-propagasi ke handler terluar (yang memang
 * fire-and-forget), supaya monitoring bisa menangkapnya.
 */
export async function emitWebhookEvent(
  organizationId: string,
  event: WebhookEvent,
  payload: unknown,
): Promise<void> {
  try {
    const endpoints = await db
      .select({ id: webhookEndpoint.id, events: webhookEndpoint.events })
      .from(webhookEndpoint)
      .where(
        and(eq(webhookEndpoint.organizationId, organizationId), eq(webhookEndpoint.isActive, true)),
      );

    for (const endpoint of endpoints) {
      // events jsonb — filter di app karena operator jsonb lintas dialect
      // ribet di drizzle 0.45
      if (!endpoint.events?.includes(event)) continue;

      const deliveryId = `sk_whdel_${randomUUID().replace(/-/g, "")}`;
      try {
        await db.insert(webhookDelivery).values({
          id: deliveryId,
          endpointId: endpoint.id,
          organizationId,
          event,
          payload: payload as Record<string, unknown>,
          status: "queued",
        });
        await enqueueWebhookDelivery(deliveryId);
      } catch (error) {
        // 23505 = unique_violation: duplikat (endpointId, event, payload) →
        // idempoten, skip dengan sengaja. Selebihnya TIDAK ditelan.
        if (!isUniqueViolation(error)) {
          console.error(
            `[webhook] gagal membuat delivery ${deliveryId} untuk endpoint ${endpoint.id} (event ${event}):`,
            error,
          );
          throw error;
        }
      }
    }
  } catch (error) {
    // best-effort: webhook keluar tidak boleh menggagalkan operasi utama.
    // Tapi di-log (bukan ditelan diam-diam) supaya bisa dipantau.
    console.error(`[webhook] emit event ${event} untuk org ${organizationId} gagal:`, error);
  }
}

/**
 * Deteksi PostgreSQL unique_violation (code 23505) dari error driver
 * node-postgres. Diekspor untuk unit test (lihat webhook-emit.test.ts).
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: string; constraint?: string };
  return e.code === "23505";
}
