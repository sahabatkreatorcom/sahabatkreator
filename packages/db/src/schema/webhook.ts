// Webhook KELUAR (outgoing) — notifikasi event ke endpoint milik org.
//
// Dua tabel, pola webhook_log + processed_webhook_event (billing.ts) dibalik arah:
//   webhook_endpoint  → konfigurasi (url, secret HMAC, event subscription)
//   webhook_delivery  → tiap attempt pengiriman + status + response (audit)
//
// Secret HMAC disimpan terenkripsi (pola crypto.ts, ENCRYPTION_KEY) karena
// dipakai menandatangani payload — bukan untuk lookup, jadi tidak pernah
// di-decrypt di sisi klien. Lookup endpoint pakai id pendek (bukan secret).

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./organization";

/**
 * Event yang bisa dipilih org. Daftar ini menjadi contract publik — tambah
 * event di sini + emission point-nya, jangan pakai string bebas.
 */
export const WEBHOOK_EVENTS = [
  "post.published",
  "post.failed",
  "post.scheduled",
  "render.completed",
  "render.failed",
  "media.imported",
  "automation.triggered",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Label bebas ("Zapier", "Slack #publish") — bukan secret
    name: text("name").notNull(),
    // URL tujuan POST — divalidasi SSRF (ssrf.ts) saat create/update
    url: text("url").notNull(),
    // HMAC-SHA256 key, disimpan terenkripsi (ENCRYPTION_KEY). Decrypt hanya
    // saat signing payload di worker.
    secretEnc: text("secret_enc").notNull(),
    // Event yang dipilih (subset WEBHOOK_EVENTS). Kosong = tidak ada delivery.
    events: jsonb("events").$type<WebhookEvent[]>().notNull().default([]),
    // false = endpoint nonaktif sementara (pause), tidak menghapus konfigurasi
    isActive: boolean("is_active").notNull().default(true),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("webhook_endpoint_organization_idx").on(table.organizationId)],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    // Payload yang dikirim (snapshot, agar retry tidak terikat state)
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(), // queued | delivered | failed | retrying
    attempt: integer("attempt").notNull().default(0),
    responseStatus: text("response_status"),
    // Ringkasan response (body dipotong, untuk diagnosis tanpa simpan blob)
    responseBody: text("response_body"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("webhook_delivery_endpoint_idx").on(table.endpointId),
    index("webhook_delivery_organization_idx").on(table.organizationId),
    // Dedup: satu event + payload hash tidak dikirim ulang ke endpoint yang sama
    uniqueIndex("webhook_delivery_dedup_uidx").on(table.endpointId, table.event, table.payload),
  ],
);
