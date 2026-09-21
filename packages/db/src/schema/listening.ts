// Schema domain LISTENING — social listening (monitor keyword + hasil)
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

// Monitor keyword yang dipantau (mis. nama brand, kompetitor, topik niche)
export const listeningMonitor = pgTable(
  "listening_monitor",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Keyword yang dicocokkan (case-insensitive) */
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    /** Term yang mengecualikan item bila ada di konten */
    excludedTerms: jsonb("excluded_terms").$type<string[]>().notNull().default([]),
    /** Platform yang dipantau (dari data engagement tersinkron) */
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("listening_monitor_organizationId_idx").on(table.organizationId)],
);

// Satu hasil mention/pembicaraan yang cocok dengan keyword monitor
export const listeningItem = pgTable(
  "listening_item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => listeningMonitor.id, { onDelete: "cascade" }),
    /** Sumber: comment / mention / review / dm / web */
    sourceType: text("source_type").notNull(),
    platform: text("platform").notNull(),
    /** ID unik sumber (platform item id / URL web) */
    sourceId: text("source_id").notNull(),
    externalUrl: text("external_url"),
    authorName: text("author_name"),
    authorAvatarUrl: text("author_avatar_url"),
    content: text("content"),
    mediaUrl: text("media_url"),
    /** positive / neutral / negative / question — lexicon sederhana */
    sentiment: text("sentiment").notNull().default("neutral"),
    /** Keyword monitor yang match di konten */
    matchedKeywords: jsonb("matched_keywords").$type<string[]>().notNull().default([]),
    isRead: boolean("is_read").notNull().default(false),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Dedupe: satu sumber hanya sekali per monitor
    uniqueIndex("listening_item_monitor_source_uidx").on(table.monitorId, table.sourceId),
    index("listening_item_organizationId_idx").on(table.organizationId),
    index("listening_item_occurredAt_idx").on(table.occurredAt),
    index("listening_item_monitorId_idx").on(table.monitorId),
  ],
);

// Sumber web (blog/kompetitor) yang di-crawl untuk keyword monitoring
export const listeningSource = pgTable(
  "listening_source",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** auto (deteksi RSS/sitemap) / rss / sitemap / page */
    sourceType: text("source_type").notNull().default("auto"),
    isActive: boolean("is_active").notNull().default(true),
    lastCrawledAt: timestamp("last_crawled_at"),
    lastError: text("last_error"),
    /** Jumlah halaman ditemukan saat crawl terakhir */
    lastPageCount: integer("last_page_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("listening_source_organizationId_idx").on(table.organizationId)],
);

export const listeningMonitorRelations = relations(listeningMonitor, ({ one, many }) => ({
  organization: one(organization, {
    fields: [listeningMonitor.organizationId],
    references: [organization.id],
  }),
  items: many(listeningItem),
}));

export const listeningItemRelations = relations(listeningItem, ({ one }) => ({
  monitor: one(listeningMonitor, {
    fields: [listeningItem.monitorId],
    references: [listeningMonitor.id],
  }),
  organization: one(organization, {
    fields: [listeningItem.organizationId],
    references: [organization.id],
  }),
}));

export const listeningSourceRelations = relations(listeningSource, ({ one }) => ({
  organization: one(organization, {
    fields: [listeningSource.organizationId],
    references: [organization.id],
  }),
}));
