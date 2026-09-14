// Schema domain AI — tracking kredit AI per organization + log generate
import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./organization";

// Agregat kredit AI per org per bulan (YYYY-MM) — dipakai untuk limit
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Periode bulan, format "YYYY-MM"
    period: text("period").notNull(),
    // Jumlah kredit terpakai bulan ini
    creditsUsed: integer("credits_used").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("ai_usage_org_period_uidx").on(table.organizationId, table.period)],
);

// Log individual pemakaian AI (untuk audit & analitik)
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // Jenis generate: caption | hashtag | rewrite | reply | alt_text
    action: text("action").notNull(),
    // Platform target (instagram, tiktok, dll)
    platform: text("platform"),
    // Model yang dipakai
    model: text("model"),
    // Kredit yang dikonsumsi (default 1)
    credits: integer("credits").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_usage_log_organizationId_idx").on(table.organizationId),
    index("ai_usage_log_createdAt_idx").on(table.createdAt),
  ],
);

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  organization: one(organization, {
    fields: [aiUsage.organizationId],
    references: [organization.id],
  }),
}));

export const aiUsageLogRelations = relations(aiUsageLog, ({ one }) => ({
  organization: one(organization, {
    fields: [aiUsageLog.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [aiUsageLog.userId],
    references: [user.id],
  }),
}));
