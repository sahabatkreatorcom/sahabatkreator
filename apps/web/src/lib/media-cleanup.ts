import { db, schema } from "@sahabat-kreator/db";
import { listFiles, deleteFile } from "@/lib/storage";

/**
 * Pembersihan storage R2 otomatis:
 *  1. Orphan media — file `orgs/{org}/media/...` & `orgs/{org}/media-transcoded/...`
 *     yang tidak direferensikan record media mana pun (mis. upload gagal, DB dihapus).
 *  2. Orphan video frames — `orgs/{org}/media-frames/{mediaId}/...` yang mediaId-nya
 *     sudah tidak ada di tabel media.
 *  3. TikTok temp JPEG — `tiktok-jpeg/...` yang lebih tua dari TIKTOK_JPEG_DAYS
 *     (hasil konversi PNG→JPEG saat publish; tidak pernah disimpan di DB).
 *
 * Semua penghapusan irreversible. `dryRun=true` hanya melaporkan tanpa menghapus.
 */

const TIKTOK_JPEG_DAYS = 7;
const PAGE_SIZE = 1000;

export interface MediaCleanupResult {
    dryRun: boolean;
    scanned: number;
    orphanMedia: string[];
    orphanFrames: string[];
    tiktokJpegDeleted: string[];
    errors: string[];
}

function keyFromUrl(url: string): string | null {
    try {
        const u = new URL(url);
        return decodeURIComponent(u.pathname.replace(/^\//, ""));
    } catch {
        return null;
    }
}

export async function cleanupMediaStorage(options: { dryRun?: boolean } = {}): Promise<MediaCleanupResult> {
    const dryRun = options.dryRun ?? false;
    const result: MediaCleanupResult = {
        dryRun,
        scanned: 0,
        orphanMedia: [],
        orphanFrames: [],
        tiktokJpegDeleted: [],
        errors: [],
    };

    // ── 1. Kumpulkan key yang dikenal dari tabel media ──────────────────────
    const rows = await db
        .select({
            url: schema.media.url,
            thumbnailUrl: schema.media.thumbnailUrl,
            transcodedUrl: schema.media.transcodedUrl,
        })
        .from(schema.media);

    const knownKeys = new Set<string>();
    const mediaIds = new Set<string>();
    for (const r of rows) {
        for (const u of [r.url, r.thumbnailUrl, r.transcodedUrl]) {
            if (!u) continue;
            const k = keyFromUrl(u);
            if (k) knownKeys.add(k);
        }
    }

    const allMediaIds = await db.select({ id: schema.media.id }).from(schema.media);
    for (const m of allMediaIds) mediaIds.add(m.id);

    // ── 2. Scan prefix orgs/ untuk orphan media & frame ─────────────────────
    let token: string | undefined;
    let truncated = true;
    while (truncated) {
        const page = await listFiles("orgs/", { continuationToken: token, maxKeys: PAGE_SIZE });
        for (const f of page.files) {
            result.scanned++;
            const key = f.key;

            if (key.includes("/media-frames/")) {
                // orgs/{org}/media-frames/{mediaId}/frame-*.jpg
                const m = key.match(/media-frames\/([^/]+)\//);
                const mediaId = m?.[1];
                if (mediaId && !mediaIds.has(mediaId)) {
                    result.orphanFrames.push(key);
                    if (!dryRun) {
                        try {
                            await deleteFile(key);
                        } catch (e) {
                            result.errors.push(`frame ${key}: ${e instanceof Error ? e.message : e}`);
                        }
                    }
                }
                continue;
            }

            if (!key.includes("/media/") && !key.includes("/media-transcoded/")) continue;

            if (!knownKeys.has(key)) {
                result.orphanMedia.push(key);
                if (!dryRun) {
                    try {
                        await deleteFile(key);
                    } catch (e) {
                        result.errors.push(`media ${key}: ${e instanceof Error ? e.message : e}`);
                    }
                }
            }
        }
        truncated = page.isTruncated;
        token = page.nextContinuationToken;
        if (!truncated) break;
    }

    // ── 3. TikTok temp JPEG lebih tua dari TIKTOK_JPEG_DAYS ─────────────────
    const cutoff = Date.now() - TIKTOK_JPEG_DAYS * 86_400_000;
    token = undefined;
    truncated = true;
    while (truncated) {
        const page = await listFiles("tiktok-jpeg/", { continuationToken: token, maxKeys: PAGE_SIZE });
        for (const f of page.files) {
            result.scanned++;
            const lastMod = f.lastModified?.getTime() ?? 0;
            if (lastMod && lastMod < cutoff) {
                result.tiktokJpegDeleted.push(f.key);
                if (!dryRun) {
                    try {
                        await deleteFile(f.key);
                    } catch (e) {
                        result.errors.push(`tiktok-jpeg ${f.key}: ${e instanceof Error ? e.message : e}`);
                    }
                }
            }
        }
        truncated = page.isTruncated;
        token = page.nextContinuationToken;
        if (!truncated) break;
    }

    return result;
}
