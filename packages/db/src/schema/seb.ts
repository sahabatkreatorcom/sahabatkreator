// Schema domain SEB — AI coach proaktif (chat multi-sesi, report, rekomendasi,
// experiment, brand knowledge, platform knowledge).
// Status/kategori/priority memakai text + whitelist di server (fleksibel,
// tanpa migrasi enum saat set berkembang).
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { platformEnum } from "./enum";
import { organization } from "./organization";
import { socialAccount } from "./social";

// ---------- Brand knowledge (satu baris per org, upsert) ----------
export const sebBrandKnowledge = pgTable(
  "seb_brand_knowledge",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    websiteUrl: text("website_url"),
    audience: text("audience"),
    positioning: text("positioning"),
    products: text("products"),
    offers: text("offers"),
    voiceRules: text("voice_rules"),
    bannedTopics: text("banned_topics"),
    // Insight yang sudah disetujui user (gabungan manual + hasil scan + hasil report)
    learnedInsights: jsonb("learned_insights").$type<string[]>().notNull().default([]),
    // Draft hasil scan website / report AI — menunggu review user
    pendingInsights: jsonb("pending_insights").$type<Record<string, unknown>>(),
    websiteScanSummary: jsonb("website_scan_summary").$type<Record<string, unknown>>(),
    websiteScannedAt: timestamp("website_scanned_at"),
    updatedBySebAt: timestamp("updated_by_seb_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("seb_brand_knowledge_organization_uidx").on(table.organizationId)],
);

// ---------- Report SEB (hasil analisis AI berkala) ----------
// trigger: proactive | manual ; status: generating | completed | failed
export const sebReport = pgTable(
  "seb_report",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("generating"),
    title: text("title"),
    summary: text("summary"),
    overallScore: integer("overall_score"),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>(),
    confidence: real("confidence"),
    model: text("model"),
    // SHA-256 dari context — indikator dedup perubahan data
    inputHash: text("input_hash"),
    generatedByUserId: text("generated_by_user_id"),
    dataStartDate: timestamp("data_start_date"),
    dataEndDate: timestamp("data_end_date"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_report_organization_idx").on(table.organizationId),
    index("seb_report_createdAt_idx").on(table.createdAt),
  ],
);

// ---------- Rekomendasi (anak report, workflow status) ----------
// category: content_strategy|caption|creative|video|timing|hashtag|platform|competitor|brand
// priority: low|medium|high ; status: new|in_progress|done|dismissed
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
    category: text("category").notNull().default("content_strategy"),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("new"),
    title: text("title").notNull(),
    advice: text("advice").notNull().default(""),
    rationale: text("rationale"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    citations: jsonb("citations").$type<unknown[]>().notNull().default([]),
    impactBaseline: jsonb("impact_baseline").$type<Record<string, unknown>>(),
    // Hasil impact check (before/after 30 hari sekitar completedAt)
    impactResult: jsonb("impact_result").$type<Record<string, unknown>>(),
    impactCheckedAt: timestamp("impact_checked_at"),
    confidence: real("confidence"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_recommendation_organization_idx").on(table.organizationId),
    index("seb_recommendation_report_idx").on(table.reportId),
    index("seb_recommendation_status_idx").on(table.status),
    index("seb_recommendation_socialAccount_idx").on(table.socialAccountId),
  ],
);

// ---------- Experiment (uji hipotesis konten) ----------
// status: planned|running|completed|cancelled
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
    metric: text("metric").notNull().default("engagement_rate"),
    status: text("status").notNull().default("planned"),
    startAt: timestamp("start_at"),
    endAt: timestamp("end_at"),
    baseline: jsonb("baseline").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_experiment_organization_idx").on(table.organizationId),
    index("seb_experiment_report_idx").on(table.reportId),
    index("seb_experiment_status_idx").on(table.status),
  ],
);

// ---------- Chat multi-sesi ----------
export const sebChatSession = pgTable(
  "seb_chat_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("Chat SEB"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_chat_session_organization_idx").on(table.organizationId),
    index("seb_chat_session_user_idx").on(table.userId),
    index("seb_chat_session_updatedAt_idx").on(table.updatedAt),
  ],
);

// role: user | assistant
export const sebChatMessage = pgTable(
  "seb_chat_message",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sebChatSession.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    // { attachments: SebChatMediaAttachment[] }
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("seb_chat_message_session_idx").on(table.sessionId),
    index("seb_chat_message_createdAt_idx").on(table.createdAt),
  ],
);

// ---------- Platform knowledge (super admin, konteks tambahan SEB) ----------
export const sebPlatformKnowledge = pgTable(
  "seb_platform_knowledge",
  {
    id: text("id").primaryKey(),
    platform: platformEnum("platform").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceUrl: text("source_url"),
    confidence: real("confidence").notNull().default(0.5),
    isActive: boolean("is_active").notNull().default(true),
    effectiveAt: timestamp("effective_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("seb_platform_knowledge_platform_idx").on(table.platform),
    index("seb_platform_knowledge_active_idx").on(table.isActive),
  ],
);

// ---------- Relations ----------
export const sebBrandKnowledgeRelations = relations(sebBrandKnowledge, ({ one }) => ({
  organization: one(organization, {
    fields: [sebBrandKnowledge.organizationId],
    references: [organization.id],
  }),
}));

export const sebReportRelations = relations(sebReport, ({ one, many }) => ({
  organization: one(organization, {
    fields: [sebReport.organizationId],
    references: [organization.id],
  }),
  recommendations: many(sebRecommendation),
  experiments: many(sebExperiment),
}));

export const sebRecommendationRelations = relations(sebRecommendation, ({ one }) => ({
  organization: one(organization, {
    fields: [sebRecommendation.organizationId],
    references: [organization.id],
  }),
  report: one(sebReport, {
    fields: [sebRecommendation.reportId],
    references: [sebReport.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [sebRecommendation.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const sebExperimentRelations = relations(sebExperiment, ({ one }) => ({
  organization: one(organization, {
    fields: [sebExperiment.organizationId],
    references: [organization.id],
  }),
  report: one(sebReport, {
    fields: [sebExperiment.reportId],
    references: [sebReport.id],
  }),
}));

export const sebChatSessionRelations = relations(sebChatSession, ({ one, many }) => ({
  organization: one(organization, {
    fields: [sebChatSession.organizationId],
    references: [organization.id],
  }),
  messages: many(sebChatMessage),
}));

export const sebChatMessageRelations = relations(sebChatMessage, ({ one }) => ({
  session: one(sebChatSession, {
    fields: [sebChatMessage.sessionId],
    references: [sebChatSession.id],
  }),
}));
