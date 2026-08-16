import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { post } from "./post";
import {
  catalogSourceEnum,
  platformEnum,
  shopSyncStatusEnum,
} from "./enum";

export const shopConnection = pgTable(
  "shop_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    catalogId: text("catalog_id").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    syncStatus: shopSyncStatusEnum("sync_status").default("PENDING").notNull(),
    lastSyncAt: timestamp("last_sync_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("shop_connection_org_platform_unique").on(table.organizationId, table.platform),
    index("shop_connection_org_idx").on(table.organizationId),
  ],
);

export const productCatalog = pgTable("product_catalog", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  source: catalogSourceEnum("source").notNull(),
  externalId: text("external_id"),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    catalogId: text("catalog_id")
      .notNull()
      .references(() => productCatalog.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    currency: text("currency").default("IDR").notNull(),
    imageUrl: text("image_url"),
    productUrl: text("product_url"),
    isActive: boolean("is_active").default(true).notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    instagramProductId: text("instagram_product_id"),
    facebookProductId: text("facebook_product_id"),
    pinterestProductId: text("pinterest_product_id"),
    tiktokProductId: text("tiktok_product_id"),
    youtubeProductId: text("youtube_product_id"),
  },
  (table) => [
    uniqueIndex("product_catalog_external_unique").on(table.catalogId, table.externalId),
  ],
);

export const productTag = pgTable(
  "product_tag",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => product.id, { onDelete: "set null" }),
    platformProductId: text("platform_product_id").notNull(),
    productName: text("product_name").notNull(),
    productPrice: integer("product_price"),
    productCurrency: text("product_currency"),
    productImageUrl: text("product_image_url"),
    mediaIndex: integer("media_index").default(0).notNull(),
    positionX: integer("position_x"),
    positionY: integer("position_y"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("product_tag_post_idx").on(table.postId),
    index("product_tag_product_idx").on(table.productId),
  ],
);

export const competitor = pgTable(
  "competitor",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatar: text("avatar"),
    followers: integer("followers").default(0).notNull(),
    followerGrowth: integer("follower_growth").default(0).notNull(),
    avgEngagement: integer("avg_engagement").default(0).notNull(),
    postsPerWeek: integer("posts_per_week").default(0).notNull(),
    isVerified: boolean("is_verified").default(false).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    engagementHistory: text("engagement_history"),
    shareOfVoice: integer("share_of_voice").default(0).notNull(),
    benchmarkScore: integer("benchmark_score").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("competitor_org_platform_username_unique").on(
      table.organizationId,
      table.platform,
      table.username,
    ),
    index("competitor_org_idx").on(table.organizationId),
  ],
);

export const competitorPost = pgTable(
  "competitor_post",
  {
    id: text("id").primaryKey(),
    competitorId: text("competitor_id")
      .notNull()
      .references(() => competitor.id, { onDelete: "cascade" }),
    platformId: text("platform_id"),
    postedAt: timestamp("posted_at").notNull(),
    caption: text("caption"),
    mediaType: text("media_type"),
    engagement: integer("engagement").default(0).notNull(),
    likes: integer("likes").default(0).notNull(),
    comments: integer("comments").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("competitor_post_platform_unique").on(table.competitorId, table.platformId),
    index("competitor_post_competitor_idx").on(table.competitorId),
    index("competitor_post_posted_idx").on(table.postedAt),
  ],
);