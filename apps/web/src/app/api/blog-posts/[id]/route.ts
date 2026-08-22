import { NextRequest, NextResponse } from "next/server";
import { auth } from "@sahabat-kreator/auth";
import { db, schema } from "@sahabat-kreator/db";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        await db.delete(schema.blogPost).where(eq(schema.blogPost.id, id));
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Gagal menghapus post" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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
