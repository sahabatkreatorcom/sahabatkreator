// Schema domain ANALYTICS — metrik akun & post, snapshot harian + goal tracker
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { post } from "./content";
import { platformEnum } from "./enum";
import { organization } from "./organization";
import { socialAccount } from "./social";

// Statistik harian per social account (followers, impressions, engagement)
export const accountAnalytics = pgTable(
  "account_analytics",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    date: date("date").notNull(),
    followers: integer("followers"),
    following: integer("following"),
    posts: integer("posts"),
    impressions: bigint("impressions", { mode: "number" }),
    reach: bigint("reach", { mode: "number" }),
    profileViews: integer("profile_views"),
    engagementCount: integer("engagement_count"),
    websiteClicks: integer("website_clicks"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_analytics_account_date_uidx").on(table.socialAccountId, table.date),
    index("account_analytics_organizationId_idx").on(table.organizationId),
    index("account_analytics_date_idx").on(table.date),
    // Query ringkasan per org + rentang tanggal (overview, followersAt, report)
    index("account_analytics_organization_date_idx").on(table.organizationId, table.date),
  ],
);

// Statistik per post setelah publish
export const postAnalytics = pgTable(
  "post_analytics",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => post.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    date: date("date").notNull(),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    views: bigint("views", { mode: "number" }).notNull().default(0),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    reach: bigint("reach", { mode: "number" }).notNull().default(0),
    websiteClicks: integer("website_clicks").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("post_analytics_post_date_uidx").on(table.postId, table.date),
    index("post_analytics_organizationId_idx").on(table.organizationId),
    index("post_analytics_date_idx").on(table.date),
    // Sync analytics per akun (analytics-sync mengambil snapshot by social_account_id)
    index("post_analytics_socialAccountId_idx").on(table.socialAccountId),
    // Timeseries & agregasi per org + rentang tanggal (overview, hashtags, report)
    index("post_analytics_organization_date_idx").on(table.organizationId, table.date),
  ],
);

// Goal tracker — target metric org dengan periode, progres dihitung dari
// data account_analytics / post_analytics riil (bukan input manual).
export const goal = pgTable(
  "goal",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // followers | followers_growth | engagement | impressions | reach | posts_published
    metric: text("metric").notNull(),
    // Target angka (mis. 10000 followers, 500 engagement)
    targetValue: integer("target_value").notNull(),
    // Nilai awal periode (baseline — di-snapshot saat goal dibuat)
    baselineValue: integer("baseline_value").notNull().default(0),
    // Periode: bulan berjalan atau rentang kustom
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("goal_organization_idx").on(table.organizationId)],
);

// Jadwal laporan berkala via email (Scheduled Reports)
export const reportSchedule = pgTable(
  "report_schedule",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    // weekly | monthly
    frequency: text("frequency").notNull(),
    // weekly: hari 0-6 (Minggu=0); monthly: tanggal 1-28
    sendDay: integer("send_day").notNull().default(1),
    // Jam kirim WIB 0-23
    sendHour: integer("send_hour").notNull().default(8),
    isActive: boolean("is_active").notNull().default(true),
    lastSentAt: timestamp("last_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("report_schedule_organization_idx").on(table.organizationId)],
);

// Link laporan publik yang bisa dibagikan (Shareable Report) — token acak,
// data di-render read-only di halaman publik /r/:token tanpa login.
// Token adalah rahasia: siapa pun pegang link bisa lihat ringkasan analytics.
export const reportShare = pgTable(
  "report_share",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    // Token acak url-safe (32 char) — unik global
    token: text("token").notNull(),
    // Judul laporan yang tampil di halaman publik
    title: text("title").notNull(),
    // Rentang data: 7/30/90 hari terakhir (dihitung saat halaman publik dibuka)
    days: integer("days").notNull().default(30),
    // null = semua akun org; id social_account = filter satu akun
    accountId: text("account_id").references(() => socialAccount.id, {
      onDelete: "set null",
    }),
    createdByUserId: text("created_by_user_id"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Link kedaluwarsa otomatis 30 hari setelah dibuat
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("report_share_token_uidx").on(table.token),
    index("report_share_organization_idx").on(table.organizationId),
  ],
);

export const accountAnalyticsRelations = relations(accountAnalytics, ({ one }) => ({
  organization: one(organization, {
    fields: [accountAnalytics.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [accountAnalytics.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const postAnalyticsRelations = relations(postAnalytics, ({ one }) => ({
  organization: one(organization, {
    fields: [postAnalytics.organizationId],
    references: [organization.id],
  }),
  post: one(post, {
    fields: [postAnalytics.postId],
    references: [post.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [postAnalytics.socialAccountId],
    references: [socialAccount.id],
  }),
}));
