import { NextResponse } from "next/server";
import { db, blogPost } from "@sahabat-kreator/db";
import { requireAuth } from "@/lib/api";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, slug, excerpt, content, coverImage, status = "DRAFT", publishedAt } = body;

    if (!title || !slug || !content) {
      return NextResponse.json(
        { success: false, error: "Title, slug, and content are required" },
        { status: 400 }
      );
    }

    const post = await db.insert(blogPost).values({
      id: crypto.randomUUID(),
      slug,
      title,
      excerpt,
      content,
      coverImage,
      authorId: auth.activeOrganizationId || "system",
      status,
      publishedAt: publishedAt ? new Date(publishedAt) : null,
    }).returning();

    return NextResponse.json({ success: true, data: post[0] });
  } catch (error) {
    console.error("Error creating blog post:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create blog post" },
      { status: 500 }
    );
  }
}
