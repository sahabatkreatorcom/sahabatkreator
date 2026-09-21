// Schema domain COMPETITOR — tracking kompetitor & benchmarking
// Data kompetitor di-input manual (legal, tanpa scraping yang melanggar ToS platform)
// dan dibandingkan otomatis dengan performa analytics org sendiri.
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { platformEnum } from "./enum";
import { organization } from "./organization";

// Riwayat snapshot metrik kompetitor (untuk tren)
export type CompetitorSnapshot = {
  date: string;
  followers: number;
  engagementRate: number;
};

export const competitor = pgTable(
  "competitor",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    /** username tanpa @ (di-strip otomatis saat input) */
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    /** Input manual user — dibandingkan dengan data org */
    followers: integer("followers").notNull().default(0),
    /** Engagement rate % x100 (basis point, presisi 2 desimal) */
    avgEngagementRateBp: integer("avg_engagement_rate_bp"),
    postsPerWeek: integer("posts_per_week"),
    isVerified: boolean("is_verified").notNull().default(false),
    notes: text("notes"),
    /** Riwayat snapshot [{date, followers, engagementRate}] */
    engagementHistory: jsonb("engagement_history")
      .$type<CompetitorSnapshot[]>()
      .notNull()
      .default([]),
    lastUpdatedBy: text("last_updated_by"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("competitor_organizationId_idx").on(table.organizationId),
    index("competitor_platform_idx").on(table.platform),
  ],
);

export const competitorRelations = relations(competitor, ({ one }) => ({
  organization: one(organization, {
    fields: [competitor.organizationId],
    references: [organization.id],
  }),
}));
