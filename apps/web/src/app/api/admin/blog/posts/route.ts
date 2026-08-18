import { db, schema } from "@sahabat-kreator/db";
import { withAdmin, json } from "@/lib/api";

export const POST = withAdmin(async (auth, request: Request) => {
  try {
    const body = await request.json();
    const { title, slug, excerpt, content, coverImage, status = "DRAFT", publishedAt } = body;

    if (!title || !slug || !content) {
      return json(
        { success: false, error: "Title, slug, and content are required" },
        { status: 400 }
      );
    }

    const post = await db.insert(schema.blogPost).values({
      id: crypto.randomUUID(),
      slug,
      title,
      excerpt,
      content,
      coverImage,
      authorId: auth.session.user.id,
      status,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    }).returning();

    return json({ success: true, data: post[0] });
  } catch (error) {
    console.error("Error creating blog post:", error);
    return json(
      { success: false, error: "Failed to create blog post" },
      { status: 500 }
    );
  }
});
