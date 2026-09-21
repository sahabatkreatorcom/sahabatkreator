// Schema domain PUSH — web push notification (VAPID + subscription + preferensi per user)
//
// VAPID keys disimpan di DB (private key terenkripsi) — pattern multi-tenant:
// super admin bisa generate/rotate via admin panel tanpa redeploy (aturan #11: env tetap
// single source untuk konstanta, sedangkan VAPID adalah data runtime yang di-rotate).
import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

// VAPID key pair — singleton (id selalu "singleton")
export const vapidKey = pgTable("vapid_key", {
  id: text("id").primaryKey().default("singleton"),
  // Public key VAPID (base64url) — dikirim ke browser untuk subscribe
  publicKey: text("public_key").notNull(),
  // Private key VAPID (terenkripsi AES-256-GCM via packages/publishing crypto)
  privateKeyEnc: text("private_key_enc").notNull(),
  // Subject contact (mailto:) untuk push service
  contact: text("contact"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Subscription web push per user (satu user bisa banyak device)
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Endpoint push service (URL unik per subscription)
    endpoint: text("endpoint").notNull(),
    // Key enkripsi per-subscription (dari PushSubscription.getKey)
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // Label device dari User-Agent (mis. "iPhone · Safari")
    deviceLabel: text("device_label"),
    userAgent: text("user_agent"),
    lastNotifiedAt: timestamp("last_notified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("push_subscription_user_endpoint_uidx").on(table.userId, table.endpoint),
    index("push_subscription_organization_idx").on(table.organizationId),
  ],
);

// Preferensi notifikasi per user per org (default ON saat row belum ada)
export const notificationSetting = pgTable(
  "notification_setting",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    postPublished: boolean("post_published").notNull().default(true),
    postFailed: boolean("post_failed").notNull().default(true),
    newComment: boolean("new_comment").notNull().default(true),
    newDm: boolean("new_dm").notNull().default(true),
    newMention: boolean("new_mention").notNull().default(true),
    newReview: boolean("new_review").notNull().default(true),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("notification_setting_user_org_uidx").on(table.userId, table.organizationId),
    index("notification_setting_organization_idx").on(table.organizationId),
  ],
);

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, {
    fields: [pushSubscription.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [pushSubscription.organizationId],
    references: [organization.id],
  }),
}));

export const notificationSettingRelations = relations(notificationSetting, ({ one }) => ({
  user: one(user, {
    fields: [notificationSetting.userId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [notificationSetting.organizationId],
    references: [organization.id],
  }),
}));
