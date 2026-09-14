// Schema domain ADMIN — pengaturan platform global & audit log
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

// Pengaturan global platform (singleton — satu baris)
export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("singleton"),
  // Gate registrasi user baru
  registrationEnabled: boolean("registration_enabled").notNull().default(true),
  // Maintenance mode
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  maintenanceMessage: text("maintenance_message"),
  // Konfigurasi AI (OpenRouter) — key encrypted
  aiApiKeyEnc: text("ai_api_key_enc"),
  aiModel: text("ai_model"),
  // Konfigurasi SEB (AI coach proaktif)
  sebEnabled: boolean("seb_enabled").notNull().default(true),
  sebProactiveEnabled: boolean("seb_proactive_enabled").notNull().default(false),
  sebModel: text("seb_model"),
  sebSystemPrompt: text("seb_system_prompt"),
  sebTemperature: real("seb_temperature"),
  sebMaxChatsPerDay: integer("seb_max_chats_per_day").notNull().default(30),
  sebMaxReportsPerDay: integer("seb_max_reports_per_day").notNull().default(3),
  // Konfigurasi kolaborasi (Collab IG) — adaptasi dari reference admin/collabs
  collabEnabled: boolean("collab_enabled").notNull().default(true),
  collabMaxCollaborators: integer("collab_max_collaborators").notNull().default(5),
  collabAllowExternalCollaborators: boolean("collab_allow_external_collaborators")
    .notNull()
    .default(false),
  collabAutoAcceptInvites: boolean("collab_auto_accept_invites").notNull().default(false),
  collabInviteMessage: text("collab_invite_message"),
  // Konfigurasi pembayaran (Sumopod Pay) — adaptasi stripe-config reference.
  // Secret dienkripsi; resolve: DB (admin) → fallback env.
  sumopodApiBaseUrl: text("sumopod_api_base_url"),
  sumopodApiKeyEnc: text("sumopod_api_key_enc"),
  sumopodWebhookTokenEnc: text("sumopod_webhook_token_enc"),
  // Pengaturan umum
  supportEmail: text("support_email"),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Audit log aktivitas admin & penting
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    // Entity terdampak (mis. "user", "organization", "blog_post")
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_organizationId_idx").on(table.organizationId),
    index("audit_log_userId_idx").on(table.userId),
    index("audit_log_createdAt_idx").on(table.createdAt),
    index("audit_log_action_idx").on(table.action),
  ],
);

// Notifikasi in-app per user
export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    body: text("body"),
    // Tipe notifikasi (post_published, post_failed, billing, system, dll)
    type: text("type").notNull().default("system"),
    linkUrl: text("link_url"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at"),
    // Dismiss = sembunyikan permanen dari panel notifikasi
    dismissedAt: timestamp("dismissed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_userId_idx").on(table.userId),
    index("notification_user_read_idx").on(table.userId, table.isRead),
    index("notification_createdAt_idx").on(table.createdAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(user, {
    fields: [auditLog.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [auditLog.organizationId],
    references: [organization.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [notification.organizationId],
    references: [organization.id],
  }),
}));
