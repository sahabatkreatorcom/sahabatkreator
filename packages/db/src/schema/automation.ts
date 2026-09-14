// Schema domain AUTOMATION — aturan auto-reply keyword untuk DM & komentar
//
// Desain dari riset reference app (dm-automation.ts + comment-responder.ts):
// - Trigger keyword (match inbound DM/komentar) → aksi reply otomatis
// - Evaluasi sequential first-match-wins, semua kondisi harus match
// - Stats counter triggered/delivered untuk insight rule
// Ditambah normalisasi:
// - Tabel automationLog terpisah untuk audit + dedup per (rule, platformItemId)
//   agar satu pesan/komentar tidak diproses dua kali (sync idempoten)
import { relations } from "drizzle-orm";
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
import { socialAccount } from "./social";

// Sumber trigger automation: dm | comment
type AutomationSource = "dm" | "comment";

/**
 * Aturan automation.
 * triggers: array of keyword (case-insensitive, match bila pesan mengandung salah satu)
 * action berupa JSON fleksibel — untuk v1: { type: "reply", message: string }
 * Placeholder yang didukung: {{username}} {{name}} {{keyword}}
 */
export const automationRule = pgTable(
  "automation_rule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // dm | comment
    source: text("source").$type<AutomationSource>().notNull(),
    // Batasi ke akun sosial tertentu (null = semua akun org)
    socialAccountId: text("social_account_id").references(() => socialAccount.id, {
      onDelete: "set null",
    }),
    // Keyword trigger — lowercased saat evaluasi
    triggers: jsonb("triggers").$type<string[]>().notNull().default([]),
    // Aksi: v1 { type: "reply", message: string }
    action: jsonb("action")
      .$type<{
        type: "reply";
        message: string;
      }>()
      .notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Stats materialized
    triggeredCount: integer("triggered_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    lastTriggeredAt: timestamp("last_triggered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("automation_rule_org_active_idx").on(table.organizationId, table.isActive),
    index("automation_rule_org_source_idx").on(table.organizationId, table.source),
  ],
);

/**
 * Log eksekusi automation — audit + dedup.
 * Unique (ruleId, platformItemId): satu item platform hanya sekali per rule,
 * apa pun sumbernya (webhook/polling/retry).
 */
export const automationLog = pgTable(
  "automation_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => automationRule.id, { onDelete: "cascade" }),
    // dm | comment — sama dengan rule.source
    source: text("source").$type<AutomationSource>().notNull(),
    // platformMessageId (DM) / platformItemId (komentar)
    platformItemId: text("platform_item_id").notNull(),
    // Konteks: partner/author
    partnerName: text("partner_name"),
    partnerUsername: text("partner_username"),
    // Pesan yang dikirim
    messageSent: text("message_sent"),
    platformReplyId: text("platform_reply_id"),
    status: text("status").$type<"sent" | "failed">().notNull(),
    error: text("error"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("automation_log_rule_item_uidx").on(table.ruleId, table.platformItemId),
    index("automation_log_org_time_idx").on(table.organizationId, table.occurredAt),
  ],
);

export const automationRuleRelations = relations(automationRule, ({ one, many }) => ({
  organization: one(organization, {
    fields: [automationRule.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [automationRule.socialAccountId],
    references: [socialAccount.id],
  }),
  logs: many(automationLog),
}));

export const automationLogRelations = relations(automationLog, ({ one }) => ({
  rule: one(automationRule, {
    fields: [automationLog.ruleId],
    references: [automationRule.id],
  }),
  organization: one(organization, {
    fields: [automationLog.organizationId],
    references: [organization.id],
  }),
}));
