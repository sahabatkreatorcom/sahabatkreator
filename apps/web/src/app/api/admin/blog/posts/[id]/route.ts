import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";
import { withAdmin, json } from "@/lib/api";

// GET single post
export const GET = withAdmin(async (
  auth,
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  try {
    const post = await db
      .select({
        id: schema.blogPost.id,
        slug: schema.blogPost.slug,
        title: schema.blogPost.title,
        excerpt: schema.blogPost.excerpt,
        content: schema.blogPost.content,
        coverImage: schema.blogPost.coverImage,
        status: schema.blogPost.status,
        publishedAt: schema.blogPost.publishedAt,
        createdAt: schema.blogPost.createdAt,
        updatedAt: schema.blogPost.updatedAt,
        tags: {
          id: schema.blogTag.id,
          name: schema.blogTag.name,
          slug: schema.blogTag.slug,
        },
      })
      .from(schema.blogPost)
      .leftJoin(schema.blogPostTag, eq(schema.blogPost.id, schema.blogPostTag.postId))
      .leftJoin(schema.blogTag, eq(schema.blogPostTag.tagId, schema.blogTag.id))
      .where(eq(schema.blogPost.id, id))
      .limit(1);

    if (!post[0]) {
      return json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    const result = {
      ...post[0],
      tags: post[0].tags ? [post[0].tags] : [],
    };

    return json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching blog post:", error);
    return json(
      { success: false, error: "Failed to fetch blog post" },
      { status: 500 }
    );
  }
});

// UPDATE post
export const PATCH = withAdmin(async (
  auth,
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = await request.json();
  const { title, slug, excerpt, content, coverImage, status, publishedAt, tags } = body;

  try {
    // Update post
    const post = await db
      .update(schema.blogPost)
      .set({
        title,
        slug,
        excerpt,
        content,
        coverImage,
        status,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
      })
      .where(eq(schema.blogPost.id, id))
      .returning();

    // Delete existing tags
    await db.delete(schema.blogPostTag).where(eq(schema.blogPostTag.postId, id));

    // Add new tags
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        let tag = await db.query.blogTag.findFirst({
          where: eq(schema.blogTag.name, tagName),
        });

        if (!tag) {
          const inserted = await db.insert(schema.blogTag).values({
            id: crypto.randomUUID(),
            name: tagName,
            slug: tagName.toLowerCase().replace(/\s+/g, "-"),
          }).returning();
          tag = inserted[0];
        }

        if (tag) {
          await db.insert(schema.blogPostTag).values({
            postId: id,
            tagId: tag.id,
          });
        }
      }
    }

    return json({ success: true, data: post[0] });
  } catch (error) {
    console.error("Error updating blog post:", error);
    return json(
      { success: false, error: "Failed to update blog post" },
      { status: 500 }
    );
  }
});

// DELETE post
export const DELETE = withAdmin(async (
  auth,
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  try {
    await db.delete(schema.blogPost).where(eq(schema.blogPost.id, id));
    return json({ success: true });
  } catch (error) {
    console.error("Error deleting blog post:", error);
    return json(
      { success: false, error: "Failed to delete blog post" },
      { status: 500 }
    );
  }
});
