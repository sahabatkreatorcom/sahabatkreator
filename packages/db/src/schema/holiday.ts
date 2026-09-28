// Schema domain holiday — kalender hari besar Indonesia & internasional
// untuk rekomendasi konten (content ideas for creators)
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

/**
 * Hari besar (nasional Indonesia & internasional) — inspirasi konten kreator.
 * Recurring: bulan/tanggal fix, berulang tiap tahun.
 * ideaTemplates: ide caption/angle konten (mis. promo, edukasi, engagement)
 */
export const holiday = pgTable(
  "holiday",
  {
    id: text("id").primaryKey(), // sk_holiday_xxx
    name: text("name").notNull(),
    description: text("description"),
    /** Bulan 1-12 */
    month: integer("month").notNull(),
    /** Tanggal 1-31 */
    day: integer("day").notNull(),
    /** scope: national (Indonesia) | international */
    scope: text("scope").$type<"national" | "international">().notNull(),
    /** Kategori untuk filter (mis. retail, kuliner, pendidikan, umum) */
    category: text("category").$type<string>().notNull().default("umum"),
    /** Ide konten: array of { angle, example } */
    ideaTemplates: jsonb("idea_templates").$type<{ angle: string; example: string }[]>(),
    /** Hashtag rekomendasi */
    suggestedHashtags: jsonb("suggested_hashtags").$type<string[]>(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("holiday_month_day_name_idx").on(t.month, t.day, t.name),
    index("holiday_month_day_idx").on(t.month, t.day),
  ],
);
