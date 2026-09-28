// Public API v1 — webhook keluar (read-only).
//
// Konfigurasi endpoint (CRUD) sengaja TIDAK ada di /v1 — sama seperti api-keys,
// hanya bisa diatur via session UI (apps/server/src/routes/webhook-endpoints.ts).
// Yang dipaparkan: delivery log (audit) + daftar event yang bisa dilanggan.
import { db } from "@sahabatkreator/db";
import { WEBHOOK_EVENTS, webhookDelivery } from "@sahabatkreator/db/schema";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requireOrg } from "../../lib/auth-guard";

export const webhookDeliveryRoute = new Hono();

/** GET /v1/webhooks/deliveries — audit pengiriman webhook org. */
webhookDeliveryRoute.get("/deliveries", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);

    const deliveries = await db
      .select({
        id: webhookDelivery.id,
        endpointId: webhookDelivery.endpointId,
        event: webhookDelivery.event,
        status: webhookDelivery.status,
        attempt: webhookDelivery.attempt,
        responseStatus: webhookDelivery.responseStatus,
        createdAt: webhookDelivery.createdAt,
        deliveredAt: webhookDelivery.deliveredAt,
      })
      .from(webhookDelivery)
      .where(eq(webhookDelivery.organizationId, ctx.organization.id))
      .orderBy(desc(webhookDelivery.createdAt))
      .limit(limit);

    return c.json({ deliveries });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /v1/webhooks/events — daftar event yang bisa dilanggan. */
webhookDeliveryRoute.get("/events", async (c) => {
  try {
    await requireOrg(c);
    return c.json({ events: WEBHOOK_EVENTS });
  } catch (error) {
    return errorResponse(error);
  }
});
