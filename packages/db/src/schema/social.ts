import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { platformEnum } from "./enum";

export const socialAccount = pgTable(
  "social_account",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    platformId: text("platform_id").notNull(),
    name: text("name").notNull(),
    username: text("username"),
    customPlatformName: text("custom_platform_name"),
    avatar: text("avatar"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    lastRefreshAt: timestamp("last_refresh_at"),
    lastRefreshError: text("last_refresh_error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("social_account_org_platform_idx").on(
      table.organizationId,
      table.platform,
      table.platformId,
    ),
    index("social_account_org_idx").on(table.organizationId),
    index("social_account_platform_idx").on(table.platform),
  ],
);

export const pinterestBoardCache = pgTable(
  "pinterest_board_cache",
  {
    id: text("id").primaryKey(),
    socialAccountId: text("social_account_id")
      .notNull()
      .unique()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    boards: jsonb("boards").notNull(),
    cachedAt: timestamp("cached_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("pinterest_board_cache_expiry_idx").on(table.expiresAt)],
);

export const audienceActivity = pgTable("audience_activity", {
  id: text("id").primaryKey(),
  socialAccountId: text("social_account_id")
    .notNull()
    .unique()
    .references(() => socialAccount.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  activityGrid: jsonb("activity_grid").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});