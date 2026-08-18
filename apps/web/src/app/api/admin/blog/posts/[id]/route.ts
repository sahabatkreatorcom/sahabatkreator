import { NextResponse } from "next/server";
import { db, blogPost, blogTag, blogPostTag } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/api";

// GET single post
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
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
        updatedAt: blogPost.updatedAt,
        tags: {
          id: blogTag.id,
          name: blogTag.name,
          slug: blogTag.slug,
        },
      })
      .from(blogPost)
      .leftJoin(blogPostTag, eq(blogPost.id, blogPostTag.postId))
      .leftJoin(blogTag, eq(blogPostTag.tagId, blogTag.id))
      .where(eq(blogPost.id, id))
      .limit(1);

    if (!post[0]) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    const result = {
      ...post[0],
      tags: post[0].tags ? post[0].tags.map((t) => t) : [],
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

// UPDATE post
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { title, slug, excerpt, content, coverImage, status, publishedAt, tags } = body;

  try {
    // Update post
    const post = await db
      .update(blogPost)
      .set({
        title,
        slug,
        excerpt,
        content,
        coverImage,
        status,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
      })
      .where(eq(blogPost.id, id))
      .returning();

    // Delete existing tags
    await db.delete(blogPostTag).where(eq(blogPostTag.postId, id));

    // Add new tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        let tag = await db.query.blogTag.findFirst({
          where: eq(blogTag.name, tagName),
        });

        if (!tag) {
          tag = await db.insert(blogTag).values({
            id: crypto.randomUUID(),
            name: tagName,
            slug: tagName.toLowerCase().replace(/\s+/g, "-"),
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
    console.error("Error updating blog post:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update blog post" },
      { status: 500 }
    );
  }
}

// DELETE post
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await db.delete(blogPost).where(eq(blogPost.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting blog post:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete blog post" },
      { status: 500 }
    );
  }
}
