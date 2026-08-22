import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api";
import { eq, and, or, like, asc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "@sahabat-kreator/db";

/**
 * GET    /api/saved-responses           - List semua saved responses untuk org
 * GET    /api/saved-responses?search=X  - Search saved responses
 * POST   /api/saved-responses           - Buat saved response baru
 * DELETE /api/saved-responses/:id       - Hapus saved response
 */

interface SavedResponse {
    id: string;
    name: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    usageCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function GET(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    try {
        // Use captionTemplate as fallback for saved responses
        let where = and(
            eq(schema.captionTemplate.organizationId, ctx.activeOrganizationId!),
        );

        if (search) {
            where = and(where, or(
                like(schema.captionTemplate.name, `%${search}%`),
                like(schema.captionTemplate.caption, `%${search}%`),
            ));
        }

        if (category) {
            where = and(where, eq(schema.captionTemplate.category, category));
        }

        const templates = await db.query.captionTemplate.findMany({
            where,
            orderBy: [asc(schema.captionTemplate.category), asc(schema.captionTemplate.name)],
            columns: {
                id: true,
                name: true,
                caption: true,
                category: true,
                usageCount: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ responses: templates.map(t => ({
            id: t.id,
            name: t.name,
            content: t.caption,
            shortcut: null,
            category: t.category,
            usageCount: t.usageCount,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
        })) as SavedResponse[] });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, content, shortcut, category } = body;

    if (!name || !content) {
        return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    try {
        // Use captionTemplate for saving responses
        const result = await db.insert(schema.captionTemplate).values({
            id: randomUUID(),
            organizationId: ctx.activeOrganizationId!,
            name: name.trim(),
            caption: content.trim(),
            category: category?.trim() || null,
            usageCount: 0,
        }).returning({
            id: schema.captionTemplate.id,
            name: schema.captionTemplate.name,
            caption: schema.captionTemplate.caption,
            category: schema.captionTemplate.category,
            usageCount: schema.captionTemplate.usageCount,
            createdAt: schema.captionTemplate.createdAt,
            updatedAt: schema.captionTemplate.updatedAt,
        });

        return NextResponse.json({ response: {
            id: result[0].id,
            name: result[0].name,
            content: result[0].caption,
            shortcut: null,
            category: result[0].category,
            usageCount: result[0].usageCount,
            createdAt: result[0].createdAt,
            updatedAt: result[0].updatedAt,
        } }, { status: 201 });
    } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "23505") {
            return NextResponse.json({ error: "Name or shortcut sudah digunakan" }, { status: 409 });
        }
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "ID diperlukan" }, { status: 400 });
    }

    try {
        // Use captionTemplate for deletion
        const result = await db.delete(schema.captionTemplate)
            .where(and(
                eq(schema.captionTemplate.id, id),
                eq(schema.captionTemplate.organizationId, ctx.activeOrganizationId!),
            ))
            .returning({ id: schema.captionTemplate.id });

        if (!result.length) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const ctx = await requireAuth();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "ID diperlukan" }, { status: 400 });
    }

    const body = await req.json();

    try {
        const existing = await db.query.captionTemplate.findFirst({
            where: and(
                eq(schema.captionTemplate.id, id),
                eq(schema.captionTemplate.organizationId, ctx.activeOrganizationId!),
            ),
        });

        if (!existing) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name.trim();
        if (body.content !== undefined) updates.caption = body.content.trim();
        if (body.category !== undefined) updates.category = body.category?.trim() || null;
        updates.updatedAt = new Date();

        await db.update(schema.captionTemplate)
            .set(updates)
            .where(eq(schema.captionTemplate.id, id));

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "23505") {
            return NextResponse.json({ error: "Name or shortcut sudah digunakan" }, { status: 409 });
        }
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
