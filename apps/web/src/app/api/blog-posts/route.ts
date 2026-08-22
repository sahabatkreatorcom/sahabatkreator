import { NextRequest, NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { db, schema } from "@sahabat-kreator/db";
import { eq, desc, and, gte, or } from "drizzle-orm";

export async function GET(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = session.session.activeOrganizationId;
    // Blog posts are global, not org-specific
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) ?? 20, 1), 100);

    try {
        const posts = await db.select({
            id: schema.blogPost.id,
            slug: schema.blogPost.slug,
            title: schema.blogPost.title,
            excerpt: schema.blogPost.excerpt,
            status: schema.blogPost.status,
            publishedAt: schema.blogPost.publishedAt,
            createdAt: schema.blogPost.createdAt,
            authorId: schema.blogPost.authorId,
        })
        .from(schema.blogPost)
        .orderBy(desc(schema.blogPost.createdAt))
        .limit(limit);

        // Get author names
        const authors = await db.select({
            id: schema.user.id,
            name: schema.user.name,
            email: schema.user.email,
        }).from(schema.user);

        const authorMap = new Map(authors.map((a) => [a.id, a.name ?? a.email ?? "Unknown"]));

        return NextResponse.json({
            posts: posts.map((p) => ({
                ...p,
                authorName: authorMap.get(p.authorId) ?? "Unknown",
                wordCount: Math.floor((p.excerpt?.length ?? 0) / 5), // rough estimate
            })),
        });
    } catch {
        return NextResponse.json({ error: "Gagal memuat blog posts" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await req.json() as { id?: string };
    if (!id) {
        return NextResponse.json({ error: "ID diperlukan" }, { status: 400 });
    }

    try {
        const post = await db.query.blogPost.findFirst({
            where: eq(schema.blogPost.id, id),
        });
        if (!post) {
            return NextResponse.json({ error: "Post tidak ditemukan" }, { status: 404 });
        }

        await db.update(schema.blogPost)
            .set({ status: "PUBLISHED", publishedAt: new Date() })
            .where(eq(schema.blogPost.id, id));

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Gagal mempublish post" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();

    if (!id) {
        return NextResponse.json({ error: "ID diperlukan" }, { status: 400 });
    }

    try {
        await db.delete(schema.blogPost).where(eq(schema.blogPost.id, id));
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Gagal menghapus post" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.pathname.split("/").pop();

    if (!id) {
        return NextResponse.json({ error: "ID diperlukan" }, { status: 400 });
    }

    const body = await req.json() as { scheduledAt?: string };

    try {
        await db.update(schema.blogPost)
            .set({
                status: "SCHEDULED",
                publishedAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
                updatedAt: new Date(),
            })
            .where(eq(schema.blogPost.id, id));

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Gagal menjadwalkan post" }, { status: 500 });
    }
}
