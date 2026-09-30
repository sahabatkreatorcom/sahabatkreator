// Schema OpenAPI untuk endpoint webhook keluar /v1 (read-only).
// Konfigurasi endpoint (CRUD) hanya ada di UI sesi, bukan /v1 —
// lihat komentar di apps/server/src/routes/v1/webhooks.ts.
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const WebhookDeliveryItemSchema = z
  .object({
    id: z.string(),
    endpointId: z.string(),
    event: z.string(),
    status: z.enum(["pending", "delivered", "failed"]),
    attempt: z.number().int(),
    responseStatus: z.number().int().nullable(),
    createdAt: z.string().datetime(),
    deliveredAt: z.string().datetime().nullable(),
  })
  .openapi("WebhookDeliveryItem");

export const WebhookDeliveriesResponseSchema = z
  .object({ deliveries: z.array(WebhookDeliveryItemSchema) })
  .openapi("WebhookDeliveriesResponse");

export const WebhookEventsResponseSchema = z
  .object({ events: z.array(z.string()) })
  .openapi("WebhookEventsResponse");
