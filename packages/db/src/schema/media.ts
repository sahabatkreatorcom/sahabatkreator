import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const mediaFolder = pgTable(
  "media_folder",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#6B7280").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("media_folder_org_name_unique").on(table.organizationId, table.name),
    index("media_folder_org_idx").on(table.organizationId),
  ],
);

export const media = pgTable(
  "media",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => mediaFolder.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    duration: integer("duration"),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    transcodedUrl: text("transcoded_url"),
    transcodeStatus: text("transcode_status"),
    altText: text("alt_text"),
    tags: text("tags").array(),
    aiTags: text("ai_tags").array(),
    contentHash: text("content_hash"),
    sourceMediaId: text("source_media_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("media_org_created_idx").on(table.organizationId, table.createdAt),
    index("media_org_hash_idx").on(table.organizationId, table.contentHash),
    index("media_source_idx").on(table.sourceMediaId),
    index("media_folder_idx").on(table.folderId),
    index("media_transcode_status_created_idx").on(table.transcodeStatus, table.createdAt),
  ],
);

export const audioTrack = pgTable(
  "audio_track",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    duration: integer("duration").notNull(),
    waveformData: text("waveform_data"),
    isFeatured: boolean("is_featured").default(false).notNull(),
    category: text("category"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audio_track_org_idx").on(table.organizationId),
    index("audio_track_featured_idx").on(table.isFeatured),
  ],
);

export const stockMediaSourceEnum = pgEnum("stock_media_source", [
  "PIXABAY",
  "PEXELS",
  "UNSPLASH",
]);

export const stockMediaImport = pgTable(
  "stock_media_import",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    source: stockMediaSourceEnum("source").notNull(),
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceThumbUrl: text("source_thumb_url"),
    importedToMediaId: text("imported_to_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    importedById: text("imported_by_id"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stock_media_import_org_source_unique").on(
      table.organizationId,
      table.source,
      table.sourceId,
    ),
    index("stock_media_import_org_idx").on(table.organizationId),
  ],
);