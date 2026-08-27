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
import { platformEnum } from "./enum";

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    targetId: text("target_id"),
    targetType: text("target_type"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_actor_idx").on(table.actorId),
    index("audit_log_target_idx").on(table.targetId),
    index("audit_log_action_idx").on(table.action),
    index("audit_log_created_idx").on(table.createdAt),
  ],
);

export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("platform_settings"),
  registrationEnabled: boolean("registration_enabled").default(true).notNull(),
  maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
  maintenanceMessage: text("maintenance_message"),
  maxOrganizationsPerUser: integer("max_organizations_per_user").default(5).notNull(),
  maxMembersPerOrganization: integer("max_members_per_organization").default(20).notNull(),
  rateLimitRequestsPerMinute: integer("rate_limit_requests_per_minute").default(100).notNull(),
  tiktokDiscoveryToken: text("tiktok_discovery_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const planConfig = pgTable(
  "plan_config",
  {
    tier: text("tier").primaryKey(),
    displayName: text("display_name").default("").notNull(),
    description: text("description").default("").notNull(),
    color: text("color").default("#6B7280").notNull(),
    priceMonthly: integer("price_monthly").default(0).notNull(),
    pricingLabel: text("pricing_label").default("$0").notNull(),
    pricingPeriod: text("pricing_period").default("/mo").notNull(),
    popular: boolean("popular").default(false).notNull(),
    ctaText: text("cta_text").default("Get Started").notNull(),
    socialAccounts: integer("social_accounts").default(3).notNull(),
    teamMembers: integer("team_members").default(2).notNull(),
    scheduledPostsPerMonth: integer("scheduled_posts_per_month").default(30).notNull(),
    aiGenerationsPerMonth: integer("ai_generations_per_month").default(10).notNull(),
    competitorTracking: integer("competitor_tracking").default(0).notNull(),
    analyticsExport: boolean("analytics_export").default(false).notNull(),
    customBranding: boolean("custom_branding").default(false).notNull(),
    prioritySupport: boolean("priority_support").default(false).notNull(),
    featureBullets: text("feature_bullets").array().notNull().default(["Fast setup"]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("plan_config_tier_idx").on(table.tier)],
);

export const globalPlatformCredential = pgTable(
  "global_platform_credential",
  {
    id: text("id").primaryKey(),
    platform: platformEnum("platform").notNull().unique(),
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret").notNull(),
    webhookVerifyToken: text("webhook_verify_token"),
    isConfigured: boolean("is_configured").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("global_platform_credential_platform_idx").on(table.platform)],
);

export const globalAISettings = pgTable("global_ai_settings", {
  id: text("id").primaryKey().default("global_ai_settings"),
  apiKey: text("api_key"),
  selectedModel: text("selected_model"),
  modelName: text("model_name"),
  isConfigured: boolean("is_configured").default(false).notNull(),
  sebEnabled: boolean("seb_enabled").default(true).notNull(),
  sebProactiveEnabled: boolean("seb_proactive_enabled").default(true).notNull(),
  sebModel: text("seb_model"),
  sebModelName: text("seb_model_name"),
  sebSystemPrompt: text("seb_system_prompt"),
  sebTemperature: integer("seb_temperature").default(55).notNull(),
  sebRefreshCadence: text("seb_refresh_cadence").default("daily").notNull(),
  sebMaxVideoFrames: integer("seb_max_video_frames").default(20).notNull(),
  sebMaxReportsPerDay: integer("seb_max_reports_per_day").default(3).notNull(),
  sebMaxChatsPerDay: integer("seb_max_chats_per_day").default(30).notNull(),
  sebMaxVideosPerReport: integer("seb_max_videos_per_report").default(10).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const globalIntegrationSettings = pgTable("global_integration_settings", {
  id: text("id").primaryKey().default("global_integration_settings"),
  sumopodApiKey: text("sumopod_api_key"),
  sumopodApiSecret: text("sumopod_api_secret"),
  sumopodWebhookSecret: text("sumopod_webhook_secret"),
  sumopodWebhookToken: text("sumopod_webhook_token"),
  sumopodBase: text("sumopod_base").default("https://api-pay-sandbox.sumopod.com"),
  sumopodConfigured: boolean("sumopod_configured").default(false).notNull(),
  sumopodTrialDays: integer("sumopod_trial_days").default(0).notNull(),
  replizPlatforms: jsonb("repliz_platforms").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const processedWebhookEvent = pgTable(
  "processed_webhook_event",
  {
    eventId: text("event_id").primaryKey(),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (table) => [index("processed_webhook_processed_at_idx").on(table.processedAt)],
);

export const vapidKeyPair = pgTable("vapid_key_pair", {
  id: text("id").primaryKey().default("vapid_keys"),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").notNull(),
    link: text("link"),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_org_read_idx").on(table.organizationId, table.isRead),
    index("notification_user_read_idx").on(table.userId, table.isRead),
    index("notification_created_idx").on(table.createdAt),
  ],
);

export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    postPublished: boolean("post_published").default(true).notNull(),
    postFailed: boolean("post_failed").default(true).notNull(),
    postReadyToPublish: boolean("post_ready_to_publish").default(true).notNull(),
    tokenExpiring: boolean("token_expiring").default(true).notNull(),
    weeklyDigest: boolean("weekly_digest").default(false).notNull(),
    newComment: boolean("new_comment").default(true).notNull(),
    newDM: boolean("new_dm").default(true).notNull(),
    newMention: boolean("new_mention").default(true).notNull(),
    newReview: boolean("new_review").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notification_settings_org_user_unique_idx").on(table.organizationId, table.userId),
    index("notification_settings_user_idx").on(table.userId),
  ],
);

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    organizationId: text("organization_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("push_subscription_user_endpoint_unique_idx").on(table.userId, table.endpoint),
    index("push_subscription_org_idx").on(table.organizationId),
  ],
);

export const notificationDevice = pgTable(
  "notification_device",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    pushSubscriptionId: text("push_subscription_id").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("notification_device_org_label_unique_idx").on(table.organizationId, table.label),
    index("notification_device_org_idx").on(table.organizationId),
  ],
);

export const syncedDraft = pgTable(
  "synced_draft",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    caption: text("caption").notNull(),
    mediaIds: text("media_ids").array(),
    platformAccountIds: text("platform_account_ids").array(),
    scheduledAt: text("scheduled_at"),
    contentHash: text("content_hash").notNull(),
    lastClientSavedAt: timestamp("last_client_saved_at"),
    lastSavedAt: timestamp("last_saved_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("synced_draft_org_updated_idx").on(table.organizationId, table.updatedAt),
    index("synced_draft_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const socialListeningMonitor = pgTable(
  "social_listening_monitor",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keywords: text("keywords").array().notNull(),
    excludedTerms: text("excluded_terms").array().notNull().default([]),
    platforms: platformEnum("platforms").array().notNull().default([]),
    isActive: boolean("is_active").default(true).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("social_listening_monitor_org_active_idx").on(table.organizationId, table.isActive)],
);

export const socialListeningItem = pgTable(
  "social_listening_item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => socialListeningMonitor.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id"),
    platform: platformEnum("platform").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    externalUrl: text("external_url"),
    authorName: text("author_name"),
    authorAvatar: text("author_avatar"),
    content: text("content").notNull(),
    mediaUrl: text("media_url"),
    sentiment: text("sentiment").default("neutral").notNull(),
    matchedKeywords: text("matched_keywords").array(),
    isRead: boolean("is_read").default(false).notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("social_listening_item_unique").on(
      table.monitorId,
      table.sourceType,
      table.sourceId,
    ),
    index("social_listening_item_org_occurred_idx").on(table.organizationId, table.occurredAt),
    index("social_listening_item_org_sentiment_idx").on(table.organizationId, table.sentiment),
    index("social_listening_item_monitor_occurred_idx").on(table.monitorId, table.occurredAt),
  ],
);

export const socialListeningSource = pgTable(
  "social_listening_source",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    sourceType: text("source_type").default("auto").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    crawlDepth: integer("crawl_depth").default(0).notNull(),
    lastCrawledAt: timestamp("last_crawled_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("social_listening_source_org_active_idx").on(table.organizationId, table.isActive)],
);