import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { socialAccount } from "./social";
import { postStatusEnum, postTypeEnum, platformEnum } from "./enum";

export const post = pgTable(
  "post",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    caption: text("caption").notNull(),
    status: postStatusEnum("status").default("DRAFT").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    autoPublish: boolean("auto_publish").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    firstComment: text("first_comment"),
    isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
    viralityScore: integer("virality_score"),
    brandVoiceScore: integer("brand_voice_score"),
    isExternal: boolean("is_external").default(false).notNull(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    externalThumbnailUrl: text("external_thumbnail_url"),
    syncedAt: timestamp("synced_at"),
    platform: platformEnum("platform"),
    socialAccountId: text("social_account_id").references(() => socialAccount.id, {
      onDelete: "set null",
    }),
    postType: postTypeEnum("post_type").default("FEED").notNull(),
    platformPostId: text("platform_post_id"),
    callToAction: text("call_to_action"),
    pinTitle: varchar("pin_title", { length: 100 }),
    pinLink: text("pin_link"),
    boardId: text("board_id"),
    videoTitle: varchar("video_title", { length: 100 }),
    youtubeCategory: text("youtube_category"),
    youtubePlaylist: text("youtube_playlist"),
    videoTags: text("video_tags").array(),
    createFirstLike: boolean("create_first_like").default(false).notNull(),
    embeddable: boolean("embeddable").default(true).notNull(),
    notifySubscribers: boolean("notify_subscribers").default(true).notNull(),
    madeForKids: boolean("made_for_kids").default(false).notNull(),
    youtubePrivacy: text("youtube_privacy"),
    youtubeCommentsEnabled: boolean("youtube_comments_enabled").default(true).notNull(),
    linkedinVisibility: text("linkedin_visibility"),
    threadsTopicTag: text("threads_topic_tag"),
    threadsQuotePostId: text("threads_quote_post_id"),
    threadsShareToIg: boolean("threads_share_to_ig").default(false).notNull(),
    tiktokPrivacyLevel: text("tiktok_privacy_level"),
    tiktokContentDisclosure: boolean("tiktok_content_disclosure").default(false).notNull(),
    tiktokBrandOrganic: boolean("tiktok_brand_organic").default(false).notNull(),
    tiktokBrandContent: boolean("tiktok_brand_content").default(false).notNull(),
    tiktokIsAigc: boolean("tiktok_is_aigc").default(false).notNull(),
    tiktokComments: boolean("tiktok_comments").default(true).notNull(),
    tiktokDuets: boolean("tiktok_duets").default(true).notNull(),
    tiktokStitches: boolean("tiktok_stitches").default(true).notNull(),
    instagramShareToFeed: boolean("instagram_share_to_feed").default(true).notNull(),
    instagramComments: boolean("instagram_comments").default(true).notNull(),
    instagramLocationId: text("instagram_location_id"),
    instagramUserTags: jsonb("instagram_user_tags"),
    instagramCollaborators: jsonb("instagram_collaborators"),
    isTrialReel: boolean("is_trial_reel").default(false).notNull(),
    altText: text("alt_text"),
    location: text("location"),
    customMediaIds: text("custom_media_ids").array(),
    linkedGroupId: text("linked_group_id"),
    notifyDeviceIds: text("notify_device_ids").array(),
    pillarId: text("pillar_id"),
  },
  (table) => [
    uniqueIndex("post_org_external_unique").on(table.organizationId, table.externalId),
    index("post_org_status_idx").on(table.organizationId, table.status),
    index("post_org_scheduled_idx").on(table.organizationId, table.scheduledAt),
    index("post_org_published_idx").on(table.organizationId, table.publishedAt),
    index("post_org_status_scheduled_idx").on(
      table.organizationId,
      table.status,
      table.scheduledAt,
    ),
    index("post_linked_group_idx").on(table.linkedGroupId),
    index("post_social_account_idx").on(table.socialAccountId),
    index("post_status_scheduled_idx").on(table.status, table.scheduledAt),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    mediaId: text("media_id").notNull(),
    order: integer("order").default(0).notNull(),
    customThumbnailUrl: text("custom_thumbnail_url"),
  },
  (table) => [uniqueIndex("post_media_unique").on(table.postId, table.mediaId)],
);

export const postHashtag = pgTable(
  "post_hashtag",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    hashtagId: text("hashtag_id").notNull(),
  },
  (table) => [uniqueIndex("post_hashtag_unique").on(table.postId, table.hashtagId)],
);

export const postProduct = pgTable(
  "post_product",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
  },
  (table) => [uniqueIndex("post_product_unique").on(table.postId, table.productId)],
);

export const publishError = pgTable(
  "publish_error",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    errorCode: text("error_code").notNull(),
    errorRaw: text("error_raw").notNull(),
    errorHuman: text("error_human").notNull(),
    suggestion: text("suggestion"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [index("publish_error_post_idx").on(table.postId)],
);