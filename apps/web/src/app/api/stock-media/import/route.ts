import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db, schema } from "@sahabat-kreator/db";
import { withAuth, json } from "@/lib/api";
import { uploadFile, getPublicUrl } from "@/lib/storage";
import { isStockMediaConfigured, type StockMediaSource } from "@/lib/stock-media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_SOURCES: StockMediaSource[] = ["PIXABAY", "PEXELS", "UNSPLASH"];

export const POST = withAuth(async (ctx, req: NextRequest) => {
    const { activeOrganizationId } = ctx;
    if (!activeOrganizationId) {
        return json({ error: "Pilih workspace dulu." }, { status: 400 });
    }

    let body: {
        source?: string;
        sourceId?: string;
        sourceUrl?: string;
        thumbUrl?: string;
        description?: string;
        mimeType?: string;
        folderId?: string;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const source = (body.source || "").toUpperCase() as StockMediaSource;
    if (!VALID_SOURCES.includes(source)) {
        return json({ error: "Invalid source." }, { status: 400 });
    }
    if (!body.sourceId || !body.sourceUrl) {
        return json({ error: "sourceId dan sourceUrl wajib." }, { status: 400 });
    }
    if (!isStockMediaConfigured(source)) {
        return json({ error: `${source} API key belum dikonfigurasi di server.` }, { status: 503 });
    }

    try {
        // Duplikat? cek apakah sudah pernah diimpor di org ini
        const existing = await db.query.stockMediaImport.findFirst({
            where: (t, { and, eq }) =>
                and(eq(t.organizationId, activeOrganizationId), eq(t.source, source), eq(t.sourceId, body.sourceId!)),
            columns: { importedToMediaId: true },
        });

        if (existing?.importedToMediaId) {
            return json({ ok: true, imported: false, mediaId: existing.importedToMediaId });
        }

        // Download dari URL stock
        const fetchRes = await fetch(body.sourceUrl, {
            redirect: "follow",
            cache: "no-store",
            signal: AbortSignal.timeout(45_000),
        });
        if (!fetchRes.ok) {
            return json({ error: `Gagal download media: HTTP ${fetchRes.status}` }, { status: 502 });
        }

        const arrayBuffer = await fetchRes.arrayBuffer();
        const bytes = Buffer.from(arrayBuffer);
        const size = bytes.byteLength;
        const contentType = body.mimeType || fetchRes.headers.get("content-type") || "application/octet-stream";

        const ext = extFromMime(contentType) || extFromUrl(body.sourceUrl) || "bin";
        const key = `orgs/${activeOrganizationId}/media/${randomUUID()}.${ext}`;

        await uploadFile(key, bytes, { contentType });

        const mediaId = randomUUID();
        await db.insert(schema.media).values({
            id: mediaId,
            organizationId: activeOrganizationId,
            folderId: body.folderId || null,
            filename: `${source.toLowerCase()}-${body.sourceId}.${ext}`,
            mimeType: contentType,
            size,
            url: getPublicUrl(key),
            thumbnailUrl: body.thumbUrl || null,
            altText: body.description || null,
            tags: [source.toLowerCase()],
            createdAt: new Date(),
        });

        await db.insert(schema.stockMediaImport).values({
            id: randomUUID(),
            organizationId: activeOrganizationId,
            source,
            sourceId: body.sourceId!,
            sourceUrl: body.sourceUrl!,
            sourceThumbUrl: body.thumbUrl || null,
            importedToMediaId: mediaId,
            importedById: ctx.session.user.id,
            createdAt: new Date(),
        });

        return json({ ok: true, imported: true, mediaId });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to import stock media";
        return json({ error: message }, { status: 502 });
    }
});

function extFromMime(mime: string): string | null {
    const map: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "video/mp4": "mp4",
        "video/webm": "webm",
        "video/quicktime": "mov",
    };
    return map[mime] ?? null;
}

function extFromUrl(url: string): string | null {
    const m = url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
    return m ? m[1] : null;
}