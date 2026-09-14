// Schema domain BILLING — Sumopod Pay (pengganti Stripe)
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { paymentStatusEnum, planTierEnum, subscriptionStatusEnum } from "./enum";
import { organization } from "./organization";

// Konfigurasi plan (dikelola super admin, editable via admin panel)
export const plan = pgTable(
  "plan",
  {
    id: text("id").primaryKey(),
    tier: planTierEnum("tier").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Harga dalam IDR (satuan rupiah, tanpa desimal)
    priceIdr: integer("price_idr").notNull().default(0),
    // Interval penagihan dalam bulan (1 = bulanan, 12 = tahunan)
    billingIntervalMonths: integer("billing_interval_months").notNull().default(1),
    // Limit per periode
    maxSocialAccounts: integer("max_social_accounts").notNull().default(1),
    maxScheduledPostsPerMonth: integer("max_scheduled_posts_per_month").notNull().default(10),
    maxTeamMembers: integer("max_team_members").notNull().default(1),
    maxMediaStorageMb: integer("max_media_storage_mb").notNull().default(500),
    aiCreditsPerMonth: integer("ai_credits_per_month").notNull().default(0),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("plan_tier_interval_uidx").on(table.tier, table.billingIntervalMonths)],
);

// Langganan aktif milik organization
export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: text("plan_id").references(() => plan.id, { onDelete: "set null" }),
    tier: planTierEnum("tier").notNull().default("free"),
    status: subscriptionStatusEnum("status").notNull().default("inactive"),
    // Periode berjalan
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    // Flag trial
    trialEndsAt: timestamp("trial_ends_at"),
    canceledAt: timestamp("canceled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_organizationId_idx").on(table.organizationId),
    uniqueIndex("subscription_organization_uidx").on(table.organizationId),
  ],
);

// Pembayaran via Sumopod Pay (satu payment = satu invoice)
export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscription.id, {
      onDelete: "set null",
    }),
    planId: text("plan_id").references(() => plan.id, { onDelete: "set null" }),
    // Order ID unik yang dikirim ke Sumopod (prefix sk_)
    orderId: text("order_id").notNull(),
    // ID payment dari Sumopod
    providerPaymentId: text("provider_payment_id"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    fee: bigint("fee", { mode: "number" }),
    netAmount: bigint("net_amount", { mode: "number" }),
    currency: text("currency").notNull().default("IDR"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    paymentMethod: text("payment_method"),
    paymentLinkUrl: text("payment_link_url"),
    paymentCode: text("payment_code"),
    expiresAt: timestamp("expires_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_orderId_uidx").on(table.orderId),
    index("payment_organizationId_idx").on(table.organizationId),
    index("payment_status_idx").on(table.status),
  ],
);

// Idempotency webhook Sumopod (event_type + payment_id unik)
export const processedWebhookEvent = pgTable(
  "processed_webhook_event",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("processed_webhook_event_uidx").on(table.eventType, table.providerPaymentId),
  ],
);

// Log webhook untuk audit (admin panel)
export const webhookLog = pgTable(
  "webhook_log",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    // verified | invalid_signature | invalid_token | duplicate
    result: text("result").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("webhook_log_createdAt_idx").on(table.createdAt)],
);

export const planRelations = relations(plan, ({ many }) => ({
  subscriptions: many(subscription),
  payments: many(payment),
}));

export const subscriptionRelations = relations(subscription, ({ one, many }) => ({
  organization: one(organization, {
    fields: [subscription.organizationId],
    references: [organization.id],
  }),
  plan: one(plan, {
    fields: [subscription.planId],
    references: [plan.id],
  }),
  payments: many(payment),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  organization: one(organization, {
    fields: [payment.organizationId],
    references: [organization.id],
  }),
  subscription: one(subscription, {
    fields: [payment.subscriptionId],
    references: [subscription.id],
  }),
  plan: one(plan, {
    fields: [payment.planId],
    references: [plan.id],
  }),
}));
