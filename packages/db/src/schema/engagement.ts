// Schema domain ENGAGEMENT — inbox komentar, mention, DM, review
import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { engagementStatusEnum, engagementTypeEnum } from "./enum";
import { organization } from "./organization";
import { socialAccount } from "./social";

// Unified inbox item (komentar, mention, DM, review)
export const engagementItem = pgTable(
  "engagement_item",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    type: engagementTypeEnum("type").notNull(),
    status: engagementStatusEnum("status").notNull().default("unread"),
    // ID item di platform
    platformItemId: text("platform_item_id"),
    // Untuk threaded comment/DM
    parentId: text("parent_id"),
    // ID penulis di platform (IG/FB user id) — kunci data deletion callback
    // (Meta mengirim user_id; tanpa ini penghapusan end-user tidak bisa match)
    platformAuthorId: text("platform_author_id"),
    authorName: text("author_name"),
    authorUsername: text("author_username"),
    authorAvatarUrl: text("author_avatar_url"),
    content: text("content"),
    // Untuk review: rating 1-5
    rating: integer("rating"),
    mediaUrl: text("media_url"),
    // Reply yang dikirim
    replyContent: text("reply_content"),
    repliedAt: timestamp("replied_at"),
    // ID reply di platform (tracking, idempotensi reply)
    platformReplyId: text("platform_reply_id"),
    // Assignment ke member tim
    assignedMemberId: text("assigned_member_id"),
    // Label custom
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    sentiment: text("sentiment"),
    // Moderasi: item disembunyikan dari inbox default (bisa di-unhide)
    hidden: boolean("hidden").notNull().default(false),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("engagement_item_organizationId_idx").on(table.organizationId),
    index("engagement_item_socialAccountId_idx").on(table.socialAccountId),
    index("engagement_item_type_status_idx").on(table.type, table.status),
    index("engagement_item_occurredAt_idx").on(table.occurredAt),
    index("engagement_item_parentId_idx").on(table.parentId),
    index("engagement_item_platformAuthorId_idx").on(table.platformAuthorId),
    index("engagement_item_hidden_idx").on(table.hidden),
  ],
);

// Saved responses (canned reply)
export const savedResponse = pgTable(
  "saved_response",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("saved_response_organizationId_idx").on(table.organizationId)],
);

export const engagementItemRelations = relations(engagementItem, ({ one }) => ({
  organization: one(organization, {
    fields: [engagementItem.organizationId],
    references: [organization.id],
  }),
  socialAccount: one(socialAccount, {
    fields: [engagementItem.socialAccountId],
    references: [socialAccount.id],
  }),
}));

export const savedResponseRelations = relations(savedResponse, ({ one }) => ({
  organization: one(organization, {
    fields: [savedResponse.organizationId],
    references: [organization.id],
  }),
}));
