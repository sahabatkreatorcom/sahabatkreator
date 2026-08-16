import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { paymentStatusEnum } from "./enum";

export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    currency: text("currency").default("IDR").notNull(),
    description: text("description"),
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    invoiceNumber: text("invoice_number").notNull().unique(),
    metadata: jsonb("metadata"),
    status: paymentStatusEnum("status").default("PENDING").notNull(),
    errorMessage: text("error_message"),
    sumopodPaymentId: text("sumopod_payment_id"),
    checkoutUrl: text("checkout_url"),
    paymentLinkUrl: text("payment_link_url"),
    paymentCode: text("payment_code"),
    paymentCodeType: text("payment_code_type"),
    paymentChannelUsed: text("payment_channel_used"),
    fee: integer("fee"),
    netAmount: integer("net_amount"),
    expiresAt: timestamp("expires_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("payment_org_idx").on(table.organizationId),
    index("payment_status_idx").on(table.status),
    index("payment_sumopod_id_idx").on(table.sumopodPaymentId),
  ],
);

export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(),
    planName: text("plan_name").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").default("IDR").notNull(),
    interval: text("interval").default("month").notNull(),
    intervalCount: integer("interval_count").default(1).notNull(),
    status: text("status").default("active").notNull(),
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    canceledAt: timestamp("canceled_at"),
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    sumopodPaymentId: text("sumopod_payment_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_org_idx").on(table.organizationId),
    index("subscription_status_idx").on(table.status),
  ],
);