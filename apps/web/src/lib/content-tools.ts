import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";

// ─── Content Pillars ───────────────────────────────────────────────────────

export async function listPillars(organizationId: string) {
    const pillars = await db.query.contentPillar.findMany({
        where: eq(schema.contentPillar.organizationId, organizationId),
        orderBy: [desc(schema.contentPillar.createdAt)],
    });

    // Hitung jumlah post per pilar
    const postCounts = new Map<string, number>();
    const allPosts = await db.query.post.findMany({
        where: eq(schema.post.organizationId, organizationId),
        columns: { pillarId: true },
    });
    for (const p of allPosts) {
        if (p.pillarId) {
            postCounts.set(p.pillarId, (postCounts.get(p.pillarId) || 0) + 1);
        }
    }

    const totalPosts = allPosts.length || 1;
    return pillars.map((p) => ({
        ...p,
        posts: postCounts.get(p.id) || 0,
        percentage: Math.round(((postCounts.get(p.id) || 0) / totalPosts) * 100),
    }));
}

export async function createPillar(organizationId: string, data: { name: string; description?: string; color?: string; icon?: string }) {
    if (!data.name?.trim()) return { status: 400, error: "Nama pilar wajib diisi." };

    const existing = await db.query.contentPillar.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.name, data.name.trim())),
        columns: { id: true },
    });
    if (existing) return { status: 409, error: "Nama pilar sudah dipakai." };

    const pillar = await db
        .insert(schema.contentPillar)
        .values({
            id: randomUUID(),
            organizationId,
            name: data.name.trim(),
            description: data.description?.trim() || null,
            color: data.color || "#D4A574",
            icon: data.icon || null,
        })
        .returning();
    return { status: 201, pillar: pillar[0] };
}

export async function updatePillar(organizationId: string, id: string, data: { name?: string; description?: string | null; color?: string; icon?: string | null }) {
    const existing = await db.query.contentPillar.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Pilar tidak ditemukan." };

    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name.trim() || "";
    if (data.description !== undefined) values.description = data.description?.trim() || null;
    if (data.color !== undefined) values.color = data.color;
    if (data.icon !== undefined) values.icon = data.icon || null;

    await db.update(schema.contentPillar).set(values).where(eq(schema.contentPillar.id, id));
    return { status: 200, ok: true };
}

export async function deletePillar(organizationId: string, id: string) {
    const existing = await db.query.contentPillar.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Pilar tidak ditemukan." };
    await db.delete(schema.contentPillar).where(eq(schema.contentPillar.id, id));
    return { status: 200, ok: true };
}

// ─── Caption Templates ─────────────────────────────────────────────────────

export interface CaptionTemplateInput {
    name: string;
    caption: string;
    hashtags?: string[];
    category?: string;
    thumbnailUrl?: string;
    mediaIds?: string[];
    platforms?: string[];
}

export async function listCaptionTemplates(organizationId: string) {
    return db.query.captionTemplate.findMany({
        where: eq(schema.captionTemplate.organizationId, organizationId),
        orderBy: [desc(schema.captionTemplate.updatedAt)],
    });
}

export async function createCaptionTemplate(organizationId: string, data: CaptionTemplateInput) {
    if (!data.name?.trim()) return { status: 400, error: "Nama template wajib diisi." };
    if (!data.caption?.trim()) return { status: 400, error: "Isi caption template wajib diisi." };

    const existing = await db.query.captionTemplate.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.name, data.name.trim())),
        columns: { id: true },
    });
    if (existing) return { status: 409, error: "Nama template sudah dipakai." };

    const template = await db
        .insert(schema.captionTemplate)
        .values({
            id: randomUUID(),
            organizationId,
            name: data.name.trim(),
            caption: data.caption,
            hashtags: data.hashtags || [],
            category: data.category || null,
            thumbnailUrl: data.thumbnailUrl || null,
            mediaIds: data.mediaIds || [],
            platforms: (data.platforms || []).filter(Boolean) as never,
        })
        .returning();
    return { status: 201, template: template[0] };
}

export async function updateCaptionTemplate(organizationId: string, id: string, data: Partial<CaptionTemplateInput>) {
    const existing = await db.query.captionTemplate.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Template tidak ditemukan." };

    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.caption !== undefined) values.caption = data.caption;
    if (data.hashtags !== undefined) values.hashtags = data.hashtags || [];
    if (data.category !== undefined) values.category = data.category || null;
    if (data.thumbnailUrl !== undefined) values.thumbnailUrl = data.thumbnailUrl || null;
    if (data.mediaIds !== undefined) values.mediaIds = data.mediaIds || [];
    if (data.platforms !== undefined) values.platforms = (data.platforms || []).filter(Boolean) as never;

    await db.update(schema.captionTemplate).set(values).where(eq(schema.captionTemplate.id, id));
    return { status: 200, ok: true };
}

export async function deleteCaptionTemplate(organizationId: string, id: string) {
    const existing = await db.query.captionTemplate.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Template tidak ditemukan." };
    await db.delete(schema.captionTemplate).where(eq(schema.captionTemplate.id, id));
    return { status: 200, ok: true };
}

// ─── Hashtag Collections ───────────────────────────────────────────────────

export async function listHashtagCollections(organizationId: string) {
    return db.query.hashtagCollection.findMany({
        where: eq(schema.hashtagCollection.organizationId, organizationId),
        orderBy: [desc(schema.hashtagCollection.updatedAt)],
    });
}

export async function createHashtagCollection(organizationId: string, data: { name: string; hashtags?: string[] }) {
    if (!data.name?.trim()) return { status: 400, error: "Nama koleksi wajib diisi." };
    if (!data.hashtags?.length) return { status: 400, error: "Masukkan minimal satu hashtag." };

    const cleanTags = (data.hashtags || [])
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

    const existing = await db.query.hashtagCollection.findFirst({
        where: (t, { and: _and, eq: _eq }) =>
            _and(_eq(t.organizationId, organizationId), _eq(t.name, data.name.trim())),
        columns: { id: true },
    });
    if (existing) return { status: 409, error: "Nama koleksi sudah dipakai." };

    const collection = await db
        .insert(schema.hashtagCollection)
        .values({ id: randomUUID(), organizationId, name: data.name.trim(), hashtags: cleanTags })
        .returning();
    return { status: 201, collection: collection[0] };
}

export async function updateHashtagCollection(organizationId: string, id: string, data: { name?: string; hashtags?: string[] }) {
    const existing = await db.query.hashtagCollection.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Koleksi tidak ditemukan." };

    const values: Record<string, unknown> = {};
    if (data.name !== undefined) values.name = data.name;
    if (data.hashtags !== undefined) values.hashtags = data.hashtags.map((t) => t.trim().replace(/^#/, "")).filter(Boolean);

    await db.update(schema.hashtagCollection).set(values).where(eq(schema.hashtagCollection.id, id));
    return { status: 200, ok: true };
}

export async function deleteHashtagCollection(organizationId: string, id: string) {
    const existing = await db.query.hashtagCollection.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, id), _eq(t.organizationId, organizationId)),
        columns: { id: true },
    });
    if (!existing) return { status: 404, error: "Koleksi tidak ditemukan." };
    await db.delete(schema.hashtagCollection).where(eq(schema.hashtagCollection.id, id));
    return { status: 200, ok: true };
}