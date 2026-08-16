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
import { media } from "./media";
import { socialAccount } from "./social";
import {
  platformEnum,
  sebChatRoleEnum,
  sebExperimentStatusEnum,
  sebRecommendationCategoryEnum,
  sebRecommendationPriorityEnum,
  sebRecommendationStatusEnum,
  sebReportStatusEnum,
  sebReportTriggerEnum,
} from "./enum";

export const sebReport = pgTable(
  "seb_report",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    trigger: sebReportTriggerEnum("trigger").default("PROACTIVE").notNull(),
    status: sebReportStatusEnum("status").default("COMPLETED").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    overallScore: integer("overall_score"),
    scoreBreakdown: jsonb("score_breakdown"),
    confidence: integer("confidence").default(0).notNull(),
    model: text("model"),
    inputHash: text("input_hash"),
    dataStartDate: timestamp("data_start_date"),
    dataEndDate: timestamp("data_end_date"),
    generatedById: text("generated_by_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_report_org_created_idx").on(table.organizationId, table.createdAt),
    index("seb_report_org_status_idx").on(table.organizationId, table.status),
  ],
);

export const sebRecommendation = pgTable(
  "seb_recommendation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id").references(() => socialAccount.id, {
      onDelete: "set null",
    }),
    reportId: text("report_id").references(() => sebReport.id, { onDelete: "cascade" }),
    platform: platformEnum("platform"),
    category: sebRecommendationCategoryEnum("category").notNull(),
    priority: sebRecommendationPriorityEnum("priority").default("MEDIUM").notNull(),
    status: sebRecommendationStatusEnum("status").default("NEW").notNull(),
    title: text("title").notNull(),
    advice: text("advice").notNull(),
    rationale: text("rationale"),
    evidence: jsonb("evidence"),
    citations: jsonb("citations"),
    impactBaseline: jsonb("impact_baseline"),
    impactResult: jsonb("impact_result"),
    impactCheckedAt: timestamp("impact_checked_at"),
    confidence: integer("confidence").default(0).notNull(),
    dueAt: timestamp("due_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_recommendation_org_status_idx").on(table.organizationId, table.status),
    index("seb_recommendation_org_account_status_idx").on(
      table.organizationId,
      table.socialAccountId,
      table.status,
    ),
    index("seb_recommendation_org_platform_idx").on(table.organizationId, table.platform),
    index("seb_recommendation_report_idx").on(table.reportId),
  ],
);

export const sebBrandKnowledge = pgTable("seb_brand_knowledge", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  websiteUrl: text("website_url"),
  audience: text("audience"),
  positioning: text("positioning"),
  products: text("products"),
  offers: text("offers"),
  voiceRules: text("voice_rules"),
  bannedTopics: text("banned_topics"),
  learnedInsights: jsonb("learned_insights"),
  pendingInsights: jsonb("pending_insights"),
  websiteScanSummary: jsonb("website_scan_summary"),
  websiteScannedAt: timestamp("website_scanned_at"),
  updatedBySebAt: timestamp("updated_by_seb_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sebChatSession = pgTable(
  "seb_chat_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").default("Seb chat").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_chat_session_org_updated_idx").on(table.organizationId, table.updatedAt),
    index("seb_chat_session_user_idx").on(table.userId),
  ],
);

export const sebChatMessage = pgTable(
  "seb_chat_message",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sebChatSession.id, { onDelete: "cascade" }),
    role: sebChatRoleEnum("role").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("seb_chat_message_session_created_idx").on(table.sessionId, table.createdAt)],
);

export const sebPlatformKnowledge = pgTable(
  "seb_platform_knowledge",
  {
    id: text("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    effectiveAt: timestamp("effective_at"),
    expiresAt: timestamp("expires_at"),
    confidence: integer("confidence").default(80).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("seb_platform_knowledge_platform_active_idx").on(table.platform, table.isActive)],
);

export const sebMediaAnalysis = pgTable(
  "seb_media_analysis",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    mediaHash: text("media_hash"),
    model: text("model"),
    frameCount: integer("frame_count").default(0).notNull(),
    ocrText: text("ocr_text"),
    transcript: text("transcript"),
    sceneSummary: text("scene_summary"),
    analysis: jsonb("analysis").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("seb_media_analysis_media_hash_unique").on(table.mediaId, table.mediaHash),
    index("seb_media_analysis_org_idx").on(table.organizationId),
  ],
);

export const sebExperiment = pgTable(
  "seb_experiment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reportId: text("report_id").references(() => sebReport.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    hypothesis: text("hypothesis").notNull(),
    platform: platformEnum("platform"),
    metric: text("metric").notNull(),
    status: sebExperimentStatusEnum("status").default("PLANNED").notNull(),
    startAt: timestamp("start_at"),
    endAt: timestamp("end_at"),
    baseline: jsonb("baseline"),
    result: jsonb("result"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_experiment_org_status_idx").on(table.organizationId, table.status),
    index("seb_experiment_report_idx").on(table.reportId),
  ],
);