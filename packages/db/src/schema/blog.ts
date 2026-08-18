import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const blogPost = pgTable(
  "blog_post",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    content: text("content").notNull(),
    coverImage: text("cover_image"),
    authorId: text("author_id").notNull(),
    status: text("status").notNull().default("DRAFT"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("blog_post_slug_unique").on(table.slug),
    index("blog_post_status_idx").on(table.status),
    index("blog_post_published_at_idx").on(table.publishedAt),
  ],
);

export const blogTag = pgTable("blog_tag", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  color: text("color").default("#D4A574"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blogPostTag = pgTable(
  "blog_post_tag",
  {
    postId: text("post_id").notNull().references(() => blogPost.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => blogTag.id, { onDelete: "cascade" }),
  },
  (table) => [
    { pk: table.postId, column: table.tagId },
  ],
);

export const blogComment = pgTable(
  "blog_comment",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => blogPost.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("blog_comment_post_idx").on(table.postId),
    index("blog_comment_status_idx").on(table.status),
  ],
);
