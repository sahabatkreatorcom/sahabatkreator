import { db, schema } from "@sahabat-kreator/db";
import { eq, desc, asc, and } from "drizzle-orm";

export interface BlogPostWithTags {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  authorId: string;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags?: Array<{ id: string; name: string; slug: string; color: string | null }>;
}

export async function getAllPublishedPosts(): Promise<BlogPostWithTags[]> {
  const posts = await db
    .select({
      id: schema.blogPost.id,
      slug: schema.blogPost.slug,
      title: schema.blogPost.title,
      excerpt: schema.blogPost.excerpt,
      content: schema.blogPost.content,
      coverImage: schema.blogPost.coverImage,
      authorId: schema.blogPost.authorId,
      status: schema.blogPost.status,
      publishedAt: schema.blogPost.publishedAt,
      createdAt: schema.blogPost.createdAt,
      updatedAt: schema.blogPost.updatedAt,
      tags: {
        id: schema.blogTag.id,
        name: schema.blogTag.name,
        slug: schema.blogTag.slug,
        color: schema.blogTag.color,
      },
    })
    .from(schema.blogPost)
    .leftJoin(schema.blogPostTag, eq(schema.blogPost.id, schema.blogPostTag.postId))
    .leftJoin(schema.blogTag, eq(schema.blogPostTag.tagId, schema.blogTag.id))
    .where(eq(schema.blogPost.status, "PUBLISHED"))
    .orderBy(desc(schema.blogPost.publishedAt));

  // Group by post and merge tags
  const postMap = new Map<string, BlogPostWithTags>();
  for (const row of posts) {
    if (!postMap.has(row.id)) {
      postMap.set(row.id, {
        ...row,
        tags: row.tags ? [row.tags] : [],
      });
    } else if (row.tags) {
      const post = postMap.get(row.id)!;
      if (!post.tags?.some((t) => t.id === row.tags!.id)) {
        post.tags = [...(post.tags ?? []), row.tags];
      }
    }
  }

  return Array.from(postMap.values());
}

export async function getPostBySlug(slug: string): Promise<BlogPostWithTags | null> {
  const post = await db
    .select({
      id: schema.blogPost.id,
      slug: schema.blogPost.slug,
      title: schema.blogPost.title,
      excerpt: schema.blogPost.excerpt,
      content: schema.blogPost.content,
      coverImage: schema.blogPost.coverImage,
      authorId: schema.blogPost.authorId,
      status: schema.blogPost.status,
      publishedAt: schema.blogPost.publishedAt,
      createdAt: schema.blogPost.createdAt,
      updatedAt: schema.blogPost.updatedAt,
      tags: {
        id: schema.blogTag.id,
        name: schema.blogTag.name,
        slug: schema.blogTag.slug,
        color: schema.blogTag.color,
      },
    })
    .from(schema.blogPost)
    .leftJoin(schema.blogPostTag, eq(schema.blogPost.id, schema.blogPostTag.postId))
    .leftJoin(schema.blogTag, eq(schema.blogPostTag.tagId, schema.blogTag.id))
    .where(and(eq(schema.blogPost.slug, slug), eq(schema.blogPost.status, "PUBLISHED")))
    .limit(1);

  if (!post[0]) return null;

  return {
    ...post[0],
    tags: post[0].tags ? [post[0].tags] : [],
  };
}

export async function getPostByPostId(id: string): Promise<BlogPostWithTags | null> {
  const post = await db
    .select({
      id: schema.blogPost.id,
      slug: schema.blogPost.slug,
      title: schema.blogPost.title,
      excerpt: schema.blogPost.excerpt,
      content: schema.blogPost.content,
      coverImage: schema.blogPost.coverImage,
      authorId: schema.blogPost.authorId,
      status: schema.blogPost.status,
      publishedAt: schema.blogPost.publishedAt,
      createdAt: schema.blogPost.createdAt,
      updatedAt: schema.blogPost.updatedAt,
      tags: {
        id: schema.blogTag.id,
        name: schema.blogTag.name,
        slug: schema.blogTag.slug,
        color: schema.blogTag.color,
      },
    })
    .from(schema.blogPost)
    .leftJoin(schema.blogPostTag, eq(schema.blogPost.id, schema.blogPostTag.postId))
    .leftJoin(schema.blogTag, eq(schema.blogPostTag.tagId, schema.blogTag.id))
    .where(eq(schema.blogPost.id, id))
    .limit(1);

  if (!post[0]) return null;

  return {
    ...post[0],
    tags: post[0].tags ? [post[0].tags] : [],
  };
}

export async function getAllTags() {
  return await db.select().from(schema.blogTag).orderBy(asc(schema.blogTag.name));
}

export async function getPostsByTag(tagSlug: string) {
  const posts = await db
    .select({
      id: schema.blogPost.id,
      slug: schema.blogPost.slug,
      title: schema.blogPost.title,
      excerpt: schema.blogPost.excerpt,
      coverImage: schema.blogPost.coverImage,
      status: schema.blogPost.status,
      publishedAt: schema.blogPost.publishedAt,
    })
    .from(schema.blogPost)
    .innerJoin(schema.blogPostTag, eq(schema.blogPost.id, schema.blogPostTag.postId))
    .innerJoin(schema.blogTag, eq(schema.blogPostTag.tagId, schema.blogTag.id))
    .where(and(eq(schema.blogTag.slug, tagSlug), eq(schema.blogPost.status, "PUBLISHED")))
    .orderBy(desc(schema.blogPost.publishedAt));

  return posts;
}

export async function getRecentPosts(limit = 5) {
  return await db
    .select()
    .from(schema.blogPost)
    .where(eq(schema.blogPost.status, "PUBLISHED"))
    .orderBy(desc(schema.blogPost.publishedAt))
    .limit(limit);
}
