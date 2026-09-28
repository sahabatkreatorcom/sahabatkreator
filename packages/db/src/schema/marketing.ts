// Schema domain MARKETING — blog SEO-friendly + halaman marketing
import { relations } from "drizzle-orm";
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
import { user } from "./auth";
import { blogPostStatusEnum } from "./enum";

export const blogCategory = pgTable(
  "blog_category",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("blog_category_slug_uidx").on(table.slug)],
);

export const blogPost = pgTable(
  "blog_post",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    // Konten rich text (HTML dari editor admin)
    contentHtml: text("content_html").notNull().default(""),
    excerpt: text("excerpt"),
    // Cover image (URL R2)
    coverImageUrl: text("cover_image_url"),
    coverImageAlt: text("cover_image_alt"),
    categoryId: text("category_id").references(() => blogCategory.id, {
      onDelete: "set null",
    }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    status: blogPostStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at"),
    // SEO
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ogImageUrl: text("og_image_url"),
    canonicalUrl: text("canonical_url"),
    // Reading time estimasi (menit)
    readingTimeMinutes: integer("reading_time_minutes").notNull().default(1),
    isFeatured: boolean("is_featured").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("blog_post_slug_uidx").on(table.slug),
    index("blog_post_status_publishedAt_idx").on(table.status, table.publishedAt),
    index("blog_post_categoryId_idx").on(table.categoryId),
  ],
);

export const blogPostTag = pgTable(
  "blog_post_tag",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => blogPost.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    uniqueIndex("blog_post_tag_uidx").on(table.postId, table.tag),
    index("blog_post_tag_tag_idx").on(table.tag),
  ],
);

// Subscriber newsletter marketing
export const newsletterSubscriber = pgTable(
  "newsletter_subscriber",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    // Untuk double opt-in
    isVerified: boolean("is_verified").notNull().default(false),
    verifyToken: text("verify_token"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("newsletter_subscriber_email_uidx").on(table.email)],
);

// Submission form kontak dari halaman marketing
export const contactSubmission = pgTable(
  "contact_submission",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message").notNull(),
    // IP untuk rate-limit / anti-spam
    ipAddress: text("ip_address"),
    // open | resolved (ditandai admin)
    status: text("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("contact_submission_status_idx").on(table.status),
    index("contact_submission_createdAt_idx").on(table.createdAt),
  ],
);

export const blogCategoryRelations = relations(blogCategory, ({ many }) => ({
  posts: many(blogPost),
}));

export const blogPostRelations = relations(blogPost, ({ one, many }) => ({
  category: one(blogCategory, {
    fields: [blogPost.categoryId],
    references: [blogCategory.id],
  }),
  author: one(user, {
    fields: [blogPost.authorId],
    references: [user.id],
  }),
  tags: many(blogPostTag),
}));

export const blogPostTagRelations = relations(blogPostTag, ({ one }) => ({
  post: one(blogPost, {
    fields: [blogPostTag.postId],
    references: [blogPost.id],
  }),
}));
