import { NextResponse } from "next/server";
import { db, blogPost, blogTag, blogPostTag, blogComment } from "@sahabat-kreator/db";
import { eq, desc, asc } from "drizzle-orm";

// GET all published blog posts
export async function GET() {
  try {
    const posts = await db
      .select({
        id: blogPost.id,
        slug: blogPost.slug,
        title: blogPost.title,
        excerpt: blogPost.excerpt,
        coverImage: blogPost.coverImage,
        status: blogPost.status,
        publishedAt: blogPost.publishedAt,
        createdAt: blogPost.createdAt,
        tags: {
          id: blogTag.id,
          name: blogTag.name,
          slug: blogTag.slug,
        },
      })
      .from(blogPost)
      .leftJoin(blogPostTag, eq(blogPost.id, blogPostTag.postId))
      .leftJoin(blogTag, eq(blogPostTag.tagId, blogTag.id))
      .where(eq(blogPost.status, "PUBLISHED"))
      .orderBy(desc(blogPost.publishedAt));

    // Group by post
    const postMap = new Map<string, any>();
    for (const row of posts) {
      if (!postMap.has(row.id)) {
        postMap.set(row.id, {
          ...row,
          tags: row.tags ? [row.tags] : [],
        });
      } else if (row.tags) {
        const post = postMap.get(row.id)!;
        if (!post.tags.some((t: any) => t.id === row.tags!.id)) {
          post.tags.push(row.tags);
        }
      }
    }

    const result = Array.from(postMap.values());
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch blog posts" },
      { status: 500 }
    );
  }
}
