// Path OpenAPI untuk webhook keluar /v1 (audit delivery + daftar event).
// Handler: apps/server/src/routes/v1/webhooks.ts.
import { errorResponses, jsonContent, op, queryParam } from "./paths-helpers";

const S = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export function buildWebhookPaths() {
  return {
    "/v1/webhooks/deliveries": {
      get: op({
        tags: ["Webhooks"],
        summary: "Log pengiriman webhook",
        description:
          "Audit pengiriman webhook organisasi (maks 100). Konfigurasi endpoint " +
          "sendiri hanya bisa diatur via UI sesi (Settings → Webhook), bukan API.",
        scopes: ["webhooks:read"],
        parameters: [
          queryParam("limit", { type: "integer", default: 50, minimum: 1, maximum: 100 }),
        ],
        responses: {
          "200": {
            description: "Daftar delivery terbaru.",
            content: jsonContent(S("WebhookDeliveriesResponse")),
          },
          ...errorResponses(),
        },
      }),
    },

    "/v1/webhooks/events": {
      get: op({
        tags: ["Webhooks"],
        summary: "Daftar event yang dapat dilanggan",
        description:
          "Daftar event webhook yang bisa dipilih saat membuat endpoint. " +
          "Versi ini adalah kontrak stabil: event baru hanya ditambahkan, " +
          "tidak dihapus atau diubah namanya.",
        scopes: ["webhooks:read"],
        responses: {
          "200": {
            description: "Daftar event.",
            content: jsonContent(S("WebhookEventsResponse")),
          },
          ...errorResponses(),
        },
      }),
    },
  };
}
