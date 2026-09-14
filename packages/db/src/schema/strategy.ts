// Schema domain strategi konten — brand voice & koleksi hashtag.
// (contentPillar & captionTemplate ada di schema/content.ts)
import { relations } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organization";

// Brand voice org — satu baris per org (upsert). Dipakai sebagai konteks
// prompt AI generate caption & rewrite agar gaya konsisten.
export const brandVoice = pgTable(
  "brand_voice",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Deskripsi suara brand, mis. "Ramah dan memezet, pakai Bahasa Indonesia santai"
    description: text("description"),
    // 3–6 kata tone, mis. ["ramah", "lucu", "pedagogis"]
    tones: text("tones").array().notNull().default([]),
    // Kata/frasa khas yang sering dipakai (gaya brand vocabulary)
    vocabulary: text("vocabulary").array().notNull().default([]),
    // Hal yang harus dihindari, mis. ["bahasa gaul kasar", "akronim asing"]
    avoid: text("avoid").array().notNull().default([]),
    // Pedoman tambahan bebas teks
    guidelines: text("guidelines"),
    // Contoh caption yang sudah tayang (bahan tiruan gaya AI)
    samples: text("samples").array().notNull().default([]),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("brand_voice_organization_uidx").on(table.organizationId)],
);

// Koleksi hashtag — set siap pakai per tema/kampanye
export const hashtagCollection = pgTable(
  "hashtag_collection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hashtags: text("hashtags").array().notNull().default([]),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("hashtag_collection_organization_idx").on(table.organizationId)],
);

// Template UTM — preset parameter tracking link untuk kampanye berulang
export const utmTemplate = pgTable(
  "utm_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // utm_source wajib (mis. instagram), medium wajib (mis. social), campaign wajib
    source: text("source").notNull(),
    medium: text("medium").notNull(),
    campaign: text("campaign").notNull(),
    term: text("term"),
    content: text("content"),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("utm_template_organization_idx").on(table.organizationId)],
);

export const brandVoiceRelations = relations(brandVoice, ({ one }) => ({
  organization: one(organization, {
    fields: [brandVoice.organizationId],
    references: [organization.id],
  }),
}));

export const hashtagCollectionRelations = relations(hashtagCollection, ({ one }) => ({
  organization: one(organization, {
    fields: [hashtagCollection.organizationId],
    references: [organization.id],
  }),
}));

export const utmTemplateRelations = relations(utmTemplate, ({ one }) => ({
  organization: one(organization, {
    fields: [utmTemplate.organizationId],
    references: [organization.id],
  }),
}));
