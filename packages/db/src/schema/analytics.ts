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
import { post } from "./post";
import { socialAccount } from "./social";
import { platformEnum } from "./enum";

export const platformAnalytics = pgTable(
  "platform_analytics",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    date: timestamp("date", { mode: "date" }).notNull(),
    followers: integer("followers").default(0).notNull(),
    followersChange: integer("followers_change").default(0).notNull(),
    following: integer("following").default(0).notNull(),
    impressions: integer("impressions").default(0).notNull(),
    reach: integer("reach").default(0).notNull(),
    engagementRate: integer("engagement_rate").default(0).notNull(),
    profileViews: integer("profile_views").default(0).notNull(),
    websiteClicks: integer("website_clicks").default(0).notNull(),
    emailClicks: integer("email_clicks").default(0).notNull(),
    platformMetrics: jsonb("platform_metrics"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("platform_analytics_account_date_unique").on(
      table.socialAccountId,
      table.date,
    ),
    index("platform_analytics_org_date_idx").on(table.organizationId, table.date),
    index("platform_analytics_account_date_idx").on(table.socialAccountId, table.date),
  ],
);

export const postAnalytics = pgTable(
  "post_analytics",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").unique().references(() => post.id, { onDelete: "cascade" }),
    impressions: integer("impressions").default(0).notNull(),
    reach: integer("reach").default(0).notNull(),
    likes: integer("likes").default(0).notNull(),
    comments: integer("comments").default(0).notNull(),
    shares: integer("shares").default(0).notNull(),
    saves: integer("saves").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    videoViews: integer("video_views"),
    videoWatchTime: integer("video_watch_time"),
    avgWatchPercentage: integer("avg_watch_percentage"),
    engagementRate: integer("engagement_rate").default(0).notNull(),
    platformMetrics: jsonb("platform_metrics"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [index("post_analytics_post_idx").on(table.postId)],
);

export const dailyAnalyticsSnapshot = pgTable(
  "daily_analytics_snapshot",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    date: timestamp("date", { mode: "date" }).notNull(),
    likes: integer("likes").default(0).notNull(),
    comments: integer("comments").default(0).notNull(),
    shares: integer("shares").default(0).notNull(),
    saves: integer("saves").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    impressions: integer("impressions").default(0).notNull(),
    reach: integer("reach").default(0).notNull(),
    videoViews: integer("video_views").default(0).notNull(),
    followers: integer("followers").default(0).notNull(),
    followersChange: integer("followers_change").default(0).notNull(),
    engagementRate: integer("engagement_rate").default(0).notNull(),
    postsPublished: integer("posts_published").default(0).notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("daily_snapshot_org_platform_date_unique").on(
      table.organizationId,
      table.platform,
      table.date,
    ),
    index("daily_snapshot_org_date_idx").on(table.organizationId, table.date),
  ],
);

export const utmTemplate = pgTable(
  "utm_template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull(),
    medium: text("medium").notNull(),
    campaign: text("campaign"),
    content: text("content"),
    term: text("term"),
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("utm_template_org_name_unique").on(table.organizationId, table.name),
    index("utm_template_org_idx").on(table.organizationId),
  ],
);

export const scheduledReport = pgTable(
  "scheduled_report",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    schedule: text("schedule").notNull(),
    recipients: text("recipients").array().notNull(),
    config: jsonb("config").notNull(),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    isActive: boolean("is_active").default(true).notNull(),
    deliveryFormat: text("delivery_format").default("pdf").notNull(),
    shareToken: text("share_token").unique(),
    lastReportData: jsonb("last_report_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("scheduled_report_org_idx").on(table.organizationId),
    index("scheduled_report_next_run_idx").on(table.nextRunAt),
  ],
);