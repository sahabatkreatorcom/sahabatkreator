import { db, blogPost, blogTag, blogPostTag, blogComment } from "@sahabat-kreator/db";
import { eq, desc, asc } from "drizzle-orm";

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
      id: blogPost.id,
      slug: blogPost.slug,
      title: blogPost.title,
      excerpt: blogPost.excerpt,
      content: blogPost.content,
      coverImage: blogPost.coverImage,
      authorId: blogPost.authorId,
      status: blogPost.status,
      publishedAt: blogPost.publishedAt,
      createdAt: blogPost.createdAt,
      updatedAt: blogPost.updatedAt,
      tags: {
        id: blogTag.id,
        name: blogTag.name,
        slug: blogTag.slug,
        color: blogTag.color,
      },
    })
    .from(blogPost)
    .leftJoin(blogPostTag, eq(blogPost.id, blogPostTag.postId))
    .leftJoin(blogTag, eq(blogPostTag.tagId, blogTag.id))
    .where(eq(blogPost.status, "PUBLISHED"))
    .orderBy(desc(blogPost.publishedAt));

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
      id: blogPost.id,
      slug: blogPost.slug,
      title: blogPost.title,
      excerpt: blogPost.excerpt,
      content: blogPost.content,
      coverImage: blogPost.coverImage,
      authorId: blogPost.authorId,
      status: blogPost.status,
      publishedAt: blogPost.publishedAt,
      createdAt: blogPost.createdAt,
      updatedAt: blogPost.updatedAt,
      tags: {
        id: blogTag.id,
        name: blogTag.name,
        slug: blogTag.slug,
        color: blogTag.color,
      },
    })
    .from(blogPost)
    .leftJoin(blogPostTag, eq(blogPost.id, blogPostTag.postId))
    .leftJoin(blogTag, eq(blogPostTag.tagId, blogTag.id))
    .where(eq(blogPost.slug, slug))
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
      id: blogPost.id,
      slug: blogPost.slug,
      title: blogPost.title,
      excerpt: blogPost.excerpt,
      content: blogPost.content,
      coverImage: blogPost.coverImage,
      authorId: blogPost.authorId,
      status: blogPost.status,
      publishedAt: blogPost.publishedAt,
      createdAt: blogPost.createdAt,
      updatedAt: blogPost.updatedAt,
      tags: {
        id: blogTag.id,
        name: blogTag.name,
        slug: blogTag.slug,
        color: blogTag.color,
      },
    })
    .from(blogPost)
    .leftJoin(blogPostTag, eq(blogPost.id, blogPostTag.postId))
    .leftJoin(blogTag, eq(blogPostTag.tagId, blogTag.id))
    .where(eq(blogPost.id, id))
    .limit(1);

  if (!post[0]) return null;

  return {
    ...post[0],
    tags: post[0].tags ? [post[0].tags] : [],
  };
}

export async function getAllTags() {
  return await db.select().from(blogTag).orderBy(asc(blogTag.name));
}

export async function getPostsByTag(tagSlug: string) {
  const posts = await db
    .select({
      id: blogPost.id,
      slug: blogPost.slug,
      title: blogPost.title,
      excerpt: blogPost.excerpt,
      coverImage: blogPost.coverImage,
      status: blogPost.status,
      publishedAt: blogPost.publishedAt,
    })
    .from(blogPost)
    .innerJoin(blogPostTag, eq(blogPost.id, blogPostTag.postId))
    .innerJoin(blogTag, eq(blogPostTag.tagId, blogTag.id))
    .where(eq(blogTag.slug, tagSlug))
    .orderBy(desc(blogPost.publishedAt));

  return posts;
}

export async function getRecentPosts(limit = 5) {
  return await db
    .select()
    .from(blogPost)
    .where(eq(blogPost.status, "PUBLISHED"))
    .orderBy(desc(blogPost.publishedAt))
    .limit(limit);
}
