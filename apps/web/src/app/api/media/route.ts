import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { uploadFile, deleteFile, getPublicUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/aac",
    "audio/x-m4a",
    "audio/mp4",
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const EXT_FROM_MIME: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/aac": "aac",
    "audio/x-m4a": "m4a",
    "audio/mp4": "mp4",
};

/**
 * GET /api/media
 * List media untuk workspace aktif.
 * Query: folderId (root|id), type (image|video|audio|all), search, limit, offset.
 */
export const GET = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const where = [];
    where.push(eq(schema.media.organizationId, activeOrganizationId));

    if (folderId === "root") where.push(sql`${schema.media.folderId} IS NULL`);
    else if (folderId) where.push(eq(schema.media.folderId, folderId));

    if (type === "image") where.push(sql`${schema.media.mimeType} LIKE 'image/%'`);
    else if (type === "video") where.push(sql`${schema.media.mimeType} LIKE 'video/%'`);
    else if (type === "audio") where.push(sql`${schema.media.mimeType} LIKE 'audio/%'`);

    if (search) where.push(sql`(LOWER(${schema.media.filename}) LIKE ${`%${search.toLowerCase()}%`} OR ${search.toLowerCase()} = ANY(${schema.media.tags}))`);

    const [items, total] = await Promise.all([
        db.query.media.findMany({
            where: and(...where),
            with: { folder: { columns: { id: true, name: true, color: true } } },
            orderBy: [desc(schema.media.createdAt)],
            limit,
            offset,
        }),
        db.$count(schema.media, and(...where)),
    ]);

    return json({
        media: items.map(serializeMedia),
        total,
        limit,
        offset,
    });
});

/**
 * POST /api/media
 * Upload file ke R2 + buat record. Body: FormData(file, folderId?, tags?)
 */
export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return json({ error: "Gagal membaca FormData." }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
        return json({ error: "File tidak ditemukan di body." }, { status: 400 });
    }

    let mimeType = file.type;
    if (!mimeType) {
        const ext = file.name.split(".").pop()?.toLowerCase();
        mimeType = Object.entries(EXT_FROM_MIME).find(([, e]) => e === ext)?.[0] ?? "";
    }
    if (!ALLOWED_TYPES.has(mimeType)) {
        return json({ error: `Tipe file tidak didukung: '${mimeType || "unknown"}'.` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return json({ error: "File terlalu besar. Maksimal 100MB." }, { status: 400 });
    }

    const folderId = (formData.get("folderId") as string | null) || null;
    if (folderId) {
        const folder = await db.query.mediaFolder.findFirst({
            where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, folderId), _eq(t.organizationId, activeOrganizationId)),
            columns: { id: true },
        });
        if (!folder) return json({ error: "Folder tidak ditemukan." }, { status: 404 });
    }

    const tagsRaw = (formData.get("tags") as string | null) || "";
    const tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    const ext = EXT_FROM_MIME[mimeType] ?? "bin";
    const key = `orgs/${activeOrganizationId}/media/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    await uploadFile(key, bytes, { contentType: mimeType });

    const mediaItem = await db.insert(schema.media)
        .values({
            id: randomUUID(),
            organizationId: activeOrganizationId,
            folderId,
            filename: file.name,
            mimeType,
            size: bytes.byteLength,
            url: getPublicUrl(key),
            thumbnailUrl: mimeType.startsWith("image/") ? getPublicUrl(key) : null,
            tags,
        })
        .returning();

    return json(serializeMedia(mediaItem[0]), { status: 201 });
});

/**
 * PATCH /api/media
 * Update metadata media. Body: { id, filename?, tags?, folderId?, altText? }
 */
export const PATCH = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as
        | { id?: string; filename?: string; tags?: string[]; folderId?: string | null; altText?: string }
        | null;
    if (!body?.id) return json({ error: "Media ID wajib." }, { status: 400 });

    const existing = await db.query.media.findFirst({
        where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, body.id!), _eq(t.organizationId, activeOrganizationId)),
        columns: { id: true },
    });
    if (!existing) return json({ error: "Media tidak ditemukan." }, { status: 404 });

    const values: Record<string, unknown> = {};

    if (body.filename !== undefined) {
        if (typeof body.filename !== "string" || body.filename.trim().length === 0) {
            return json({ error: "Nama file tidak boleh kosong." }, { status: 400 });
        }
        values.filename = body.filename.trim();
    }

    if (body.tags !== undefined) {
        if (!Array.isArray(body.tags)) return json({ error: "Tags harus array." }, { status: 400 });
        values.tags = body.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
    }

    if (body.altText !== undefined) values.altText = body.altText || null;

    if (body.folderId !== undefined) {
        if (body.folderId === null || body.folderId === "") {
            values.folderId = null;
        } else {
            const folder = await db.query.mediaFolder.findFirst({
                where: (t, { and: _and, eq: _eq }) => _and(_eq(t.id, body.folderId!), _eq(t.organizationId, activeOrganizationId)),
                columns: { id: true },
            });
            if (!folder) return json({ error: "Folder tidak ditemukan." }, { status: 404 });
            values.folderId = body.folderId;
        }
    }

    const updated = await db.update(schema.media)
        .set(values)
        .where(eq(schema.media.id, body.id))
        .returning();

    return json(serializeMedia(updated[0]));
});

/**
 * DELETE /api/media
 * Hapus satu atau banyak media. Body: { ids: string[] }
 */
export const DELETE = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) return json({ error: "Pilih workspace dulu." }, { status: 400 });

    const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
    if (!body?.ids || body.ids.length === 0) {
        return json({ error: "Tidak ada ID media." }, { status: 400 });
    }

    try {
        const items = await db.query.media.findMany({
            where: (t, { and: _and, eq: _eq, inArray }) =>
                _and(_eq(t.organizationId, activeOrganizationId), inArray(t.id, body.ids!)),
            columns: { id: true, url: true, thumbnailUrl: true, transcodedUrl: true },
        });

        if (items.length === 0) return json({ error: "Media tidak ditemukan." }, { status: 404 });

        // Hapus file dari R2: url utama + thumbnail + hasil transcode (bila ada).
        const keys = new Set<string>();
        for (const m of items) {
            for (const raw of [m.url, m.thumbnailUrl, m.transcodedUrl]) {
                if (!raw) continue;
                const key = keyFromUrl(raw);
                if (key && !key.startsWith("http")) keys.add(key);
            }
        }
        await Promise.allSettled([...keys].map((key) => deleteFile(key)));

        await db
            .delete(schema.media)
            .where(and(eq(schema.media.organizationId, activeOrganizationId), inArray(schema.media.id, body.ids!)));

        return json({ success: true, deleted: items.length });
    } catch (e) {
        console.error("[media] DELETE gagal:", e);
        return json({ error: e instanceof Error ? e.message : "Gagal menghapus media." }, { status: 500 });
    }
});

function serializeMedia(m: {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string | null;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    duration: number | null;
    tags: string[] | null;
    altText: string | null;
    createdAt: Date;
    folder?: { id: string; name: string; color: string } | null;
}) {
    return {
        id: m.id,
        filename: m.filename,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        type: m.mimeType.startsWith("video/") ? "video" : m.mimeType.startsWith("audio/") ? "audio" : "image",
        mimeType: m.mimeType,
        size: m.size,
        dimensions: m.width && m.height ? { width: m.width, height: m.height } : null,
        duration: m.duration,
        tags: m.tags ?? [],
        altText: m.altText,
        folder: m.folder,
        createdAt: m.createdAt.toISOString(),
    };
}

function keyFromUrl(url: string): string {
    try {
        const u = new URL(url);
        // getPublicUrl menghasilkan https://<bucket>.<account>.r2.dev/<key>
        // atau https://<custom-domain>/<key>.
        const path = u.pathname.replace(/^\//, "");
        return decodeURIComponent(path);
    } catch {
        return url;
    }
}