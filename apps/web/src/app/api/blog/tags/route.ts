import { NextResponse } from "next/server";
import { db, blogPost, blogTag } from "@sahabat-kreator/db";
import { eq, desc, asc } from "drizzle-orm";

// GET all tags
export async function GET() {
  try {
    const tags = await db.select().from(blogTag).orderBy(asc(blogTag.name));
    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    console.error("Error fetching blog tags:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch blog tags" },
      { status: 500 }
    );
  }
}
