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
import { socialAccount } from "./social";
import { platformEnum } from "./enum";

export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    postId: text("post_id").references(() => post.id, { onDelete: "set null" }),
    platformPostId: text("platform_post_id").notNull(),
    platformCommentId: text("platform_comment_id").notNull(),
    authorId: text("author_id").notNull(),
    authorUsername: text("author_username").notNull(),
    authorAvatar: text("author_avatar"),
    text: text("text").notNull(),
    sentiment: text("sentiment"),
    isReplied: boolean("is_replied").default(false).notNull(),
    isHidden: boolean("is_hidden").default(false).notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    assignedToId: text("assigned_to_id"),
    labelIds: text("label_ids").array(),
    parentId: text("parent_id"),
    likeCount: integer("like_count").default(0).notNull(),
    replyCount: integer("reply_count").default(0).notNull(),
    createdAt: timestamp("created_at").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("comment_social_platform_unique").on(table.socialAccountId, table.platformCommentId),
    index("comment_org_created_idx").on(table.organizationId, table.createdAt),
    index("comment_org_read_created_idx").on(table.organizationId, table.isRead, table.createdAt),
    index("comment_social_idx").on(table.socialAccountId),
    index("comment_post_idx").on(table.postId),
  ],
);

export const review = pgTable(
  "review",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    platformReviewId: text("platform_review_id").notNull(),
    authorName: text("author_name").notNull(),
    authorAvatar: text("author_avatar"),
    rating: integer("rating").notNull(),
    text: text("text"),
    replyText: text("reply_text"),
    isReplied: boolean("is_replied").default(false).notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    platform: platformEnum("platform").notNull(),
    reviewUrl: text("review_url"),
    createdAt: timestamp("created_at").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("review_social_platform_unique").on(table.socialAccountId, table.platformReviewId),
    index("review_org_created_idx").on(table.organizationId, table.createdAt),
    index("review_social_idx").on(table.socialAccountId),
  ],
);

export const mention = pgTable(
  "mention",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    platformPostId: text("platform_post_id").notNull(),
    authorId: text("author_id").notNull(),
    authorUsername: text("author_username").notNull(),
    authorAvatar: text("author_avatar"),
    text: text("text"),
    mediaUrl: text("media_url"),
    isRead: boolean("is_read").default(false).notNull(),
    assignedToId: text("assigned_to_id"),
    labelIds: text("label_ids").array(),
    createdAt: timestamp("created_at").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mention_social_post_type_unique").on(
      table.socialAccountId,
      table.platformPostId,
      table.type,
    ),
    index("mention_org_read_idx").on(table.organizationId, table.isRead),
    index("mention_org_read_created_idx").on(table.organizationId, table.isRead, table.createdAt),
  ],
);

export const directMessage = pgTable(
  "direct_message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    socialAccountId: text("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    platformMessageId: text("platform_message_id").notNull(),
    direction: text("direction").notNull(),
    senderId: text("sender_id").notNull(),
    senderUsername: text("sender_username").notNull(),
    senderAvatar: text("sender_avatar"),
    text: text("text"),
    mediaUrl: text("media_url"),
    mediaType: text("media_type"),
    isRead: boolean("is_read").default(false).notNull(),
    assignedToId: text("assigned_to_id"),
    labelIds: text("label_ids").array(),
    createdAt: timestamp("created_at").notNull(),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("dm_social_platform_message_unique").on(
      table.socialAccountId,
      table.platformMessageId,
    ),
    index("dm_org_created_idx").on(table.organizationId, table.createdAt),
    index("dm_social_conversation_idx").on(table.socialAccountId, table.conversationId),
    index("dm_conversation_idx").on(table.conversationId),
  ],
);

export const inboxLabel = pgTable(
  "inbox_label",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").default("#6B7280").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inbox_label_org_name_unique").on(table.organizationId, table.name),
    index("inbox_label_org_idx").on(table.organizationId),
  ],
);

export const savedResponse = pgTable(
  "saved_response",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    content: text("content").notNull(),
    shortcut: text("shortcut"),
    category: text("category"),
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("saved_response_org_name_unique").on(table.organizationId, table.name),
    uniqueIndex("saved_response_org_shortcut_unique").on(
      table.organizationId,
      table.shortcut,
    ),
    index("saved_response_org_idx").on(table.organizationId),
  ],
);

export const automation = pgTable(
  "automation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: text("trigger").notNull(),
    platform: platformEnum("platform").notNull(),
    message: text("message").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    triggered: integer("triggered").default(0).notNull(),
    delivered: integer("delivered").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("automation_org_idx").on(table.organizationId)],
);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    userName: text("user_name"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    resourceName: text("resource_name").notNull(),
    details: text("details"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("activity_org_created_idx").on(table.organizationId, table.createdAt)],
);