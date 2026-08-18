import { NextResponse } from "next/server";
import { db, blogPost, blogTag, blogPostTag, blogComment } from "@sahabat-kreator/db";
import { eq, desc } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, slug, excerpt, content, coverImage, tags, status = "DRAFT", publishedAt } = body;

    if (!title || !slug || !content) {
      return NextResponse.json(
        { success: false, error: "Title, slug, and content are required" },
        { status: 400 }
      );
    }

    // Generate ID
    const id = crypto.randomUUID();

    // Insert post
    const post = await db.insert(blogPost).values({
      id,
      slug,
      title,
      excerpt,
      content,
      coverImage,
      authorId: "system",
      status,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    }).returning();

    // Handle tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        let tag = await db.query.blogTag.findFirst({
          where: eq(blogTag.slug, tagName.toLowerCase().replace(/\s+/g, "-")),
        });

        if (!tag) {
          const tagSlug = tagName.toLowerCase().replace(/\s+/g, "-");
          tag = await db.insert(blogTag).values({
            id: crypto.randomUUID(),
            name: tagName,
            slug: tagSlug,
          }).returning();
        }

        if (tag) {
          await db.insert(blogPostTag).values({
            postId: id,
            tagId: tag[0].id,
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: post[0] });
  } catch (error) {
    console.error("Error creating blog post:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create blog post" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    if (!slug) {
      return NextResponse.json(
        { success: false, error: "Slug is required" },
        { status: 400 }
      );
    }

    const post = await db
      .select({
        id: blogPost.id,
        slug: blogPost.slug,
        title: blogPost.title,
        excerpt: blogPost.excerpt,
        content: blogPost.content,
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
      .where(eq(blogPost.slug, slug))
      .limit(1);

    if (!post[0]) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    const result = {
      ...post[0],
      tags: post[0].tags ? [post[0].tags] : [],
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching blog post:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch blog post" },
      { status: 500 }
    );
  }
}
