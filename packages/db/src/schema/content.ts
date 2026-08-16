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
import { organization } from "./auth";
import { postTypeEnum, platformEnum } from "./enum";

export const contentPillar = pgTable(
  "content_pillar",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").default("#D4A574").notNull(),
    icon: text("icon"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("content_pillar_org_name_unique").on(table.organizationId, table.name),
  ],
);

export const captionTemplate = pgTable(
  "caption_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    caption: text("caption").notNull(),
    hashtags: text("hashtags").array(),
    category: text("category"),
    usageCount: integer("usage_count").default(0).notNull(),
    thumbnailUrl: text("thumbnail_url"),
    mediaIds: text("media_ids").array(),
    platforms: platformEnum("platforms").array(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("caption_template_org_name_unique").on(table.organizationId, table.name),
    index("caption_template_org_idx").on(table.organizationId),
  ],
);

export const hashtag = pgTable("hashtag", {
  id: text("id").primaryKey(),
  tag: text("tag").notNull().unique(),
  isBanned: boolean("is_banned").default(false).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
});

export const hashtagCollection = pgTable(
  "hashtag_collection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hashtags: text("hashtags").array(),
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("hashtag_collection_org_name_unique").on(table.organizationId, table.name),
    index("hashtag_collection_org_idx").on(table.organizationId),
  ],
);

export const brandVoice = pgTable("brand_voice", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  samples: text("samples").array(),
  toneProfile: jsonb("tone_profile"),
  guidelines: text("guidelines"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const calendarNote = pgTable(
  "calendar_note",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    date: timestamp("date").notNull(),
    color: text("color").default("#D4A574").notNull(),
    isPrivate: boolean("is_private").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("calendar_note_org_date_idx").on(table.organizationId, table.date),
    index("calendar_note_creator_idx").on(table.createdById),
  ],
);

export const draftInteraction = pgTable(
  "draft_interaction",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    postId: text("post_id"),
    action: text("action").notNull(),
    platform: platformEnum("platform").notNull(),
    postType: postTypeEnum("post_type").default("FEED").notNull(),
    suggestedDay: integer("suggested_day").notNull(),
    suggestedHour: integer("suggested_hour").notNull(),
    finalDay: integer("final_day"),
    finalHour: integer("final_hour"),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("draft_interaction_org_idx").on(table.organizationId),
    index("draft_interaction_action_idx").on(table.action),
    index("draft_interaction_platform_type_idx").on(table.platform, table.postType),
  ],
);

export const engagementPrediction = pgTable(
  "engagement_prediction",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    postType: postTypeEnum("post_type").default("FEED").notNull(),
    day: integer("day").notNull(),
    hour: integer("hour").notNull(),
    predictedScore: integer("predicted_score").default(0).notNull(),
    confidence: integer("confidence").default(0).notNull(),
    sampleSize: integer("sample_size").default(0).notNull(),
    lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("engagement_prediction_unique").on(
      table.organizationId,
      table.platform,
      table.postType,
      table.day,
      table.hour,
    ),
    index("engagement_prediction_org_idx").on(table.organizationId),
  ],
);

export const contentTimingPattern = pgTable(
  "content_timing_pattern",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    contentSignature: text("content_signature").notNull(),
    bestDay: integer("best_day").notNull(),
    bestHour: integer("best_hour").notNull(),
    avgEngagement: integer("avg_engagement").default(0).notNull(),
    sampleSize: integer("sample_size").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("content_timing_pattern_unique").on(
      table.organizationId,
      table.platform,
      table.contentSignature,
    ),
    index("content_timing_pattern_org_idx").on(table.organizationId),
  ],
);

export const hashtagTimingPattern = pgTable(
  "hashtag_timing_pattern",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    hashtag: text("hashtag").notNull(),
    bestDay: integer("best_day").notNull(),
    bestHour: integer("best_hour").notNull(),
    avgEngagement: integer("avg_engagement").default(0).notNull(),
    sampleSize: integer("sample_size").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("hashtag_timing_pattern_unique").on(
      table.organizationId,
      table.platform,
      table.hashtag,
    ),
    index("hashtag_timing_pattern_org_idx").on(table.organizationId),
  ],
);