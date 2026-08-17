import { db, schema } from "@sahabat-kreator/db";
import { and, eq, isNull, sql, like } from "drizzle-orm";
import { downloadObjectBuffer, uploadObject, frameObjectKey, publicUrlForKey } from "./storage.js";
import { processVideoBuffer, transcodeVideoBuffer } from "./ffmpeg.js";

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS) || 10_000;
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE) || 3;
const FRAME_COUNT = Number(process.env.WORKER_FRAME_COUNT) || 4;
const MAX_VIDEO_BYTES = Number(process.env.WORKER_MAX_VIDEO_BYTES) || 100 * 1024 * 1024;
const ENABLE_TRANSCODE = process.env.WORKER_ENABLE_TRANSCODE !== "false";

interface PendingMedia {
    id: string;
    organizationId: string;
    url: string;
    mimeType: string;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
    console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

async function findPendingVideos(): Promise<PendingMedia[]> {
    return db
        .select({
            id: schema.media.id,
            organizationId: schema.media.organizationId,
            url: schema.media.url,
            mimeType: schema.media.mimeType,
        })
        .from(schema.media)
        .where(
            and(
                like(schema.media.mimeType, "video/%"),
                isNull(schema.media.transcodeStatus),
                sql`${schema.media.size} <= ${MAX_VIDEO_BYTES}`,
            ),
        )
        .orderBy(sql`${schema.media.createdAt} ASC`)
        .limit(BATCH_SIZE);
}

async function processMedia(item: PendingMedia): Promise<void> {
    let mediaKey: string | null = null;
    try {
        mediaKey = decodeURIComponent(new URL(item.url).pathname).replace(/^\//, "");
    } catch {
        mediaKey = null;
    }

    if (!mediaKey || !mediaKey.startsWith("orgs/")) {
        log(`skip ${item.id}: URL bukan dari bucket (${item.url.slice(0, 80)})`);
        await db.update(schema.media)
            .set({ transcodeStatus: "SKIPPED" })
            .where(eq(schema.media.id, item.id));
        return;
    }

    log(`process ${item.id} (${item.mimeType}, url=${item.url.slice(0, 60)}...)`);
    try {
        const input = await downloadObjectBuffer(mediaKey);
        if (!input) {
            log(`skip ${item.id}: gagal download dari R2`);
            await db.update(schema.media)
                .set({ transcodeStatus: "FAILED" })
                .where(eq(schema.media.id, item.id));
            return;
        }

        const result = await processVideoBuffer(input, { count: FRAME_COUNT });

        const posterKey = frameObjectKey(item.organizationId, item.id, 0);
        await uploadObject(posterKey, result.poster, "image/jpeg");

        for (let i = 0; i < result.frames.length; i++) {
            await uploadObject(frameObjectKey(item.organizationId, item.id, i + 1), result.frames[i]!, "image/jpeg");
        }

        let transcodedUrl: string | null = null;
        if (ENABLE_TRANSCODE) {
            try {
                const transcoded = await transcodeVideoBuffer(input);
                const transcodeKey = `orgs/${item.organizationId}/media-transcoded/${item.id}.mp4`;
                await uploadObject(transcodeKey, transcoded, "video/mp4");
                transcodedUrl = publicUrlForKey(transcodeKey);
            } catch (e) {
                log(`transcode ${item.id} gagal (dilewati): ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        const dimensions = result.width && result.height ? { width: result.width, height: result.height } : null;

        await db.update(schema.media)
            .set({
                transcodeStatus: "DONE",
                thumbnailUrl: publicUrlForKey(posterKey),
                transcodedUrl,
                width: result.width,
                height: result.height,
                duration: result.durationSeconds ? Math.round(result.durationSeconds) : null,
            })
            .where(eq(schema.media.id, item.id));

        log(`done ${item.id}: ${result.frames.length + 1} frame${transcodedUrl ? ", transcoded" : ""}, ${result.durationSeconds ?? "?"}s, ${dimensions ? `${dimensions.width}x${dimensions.height}` : "no dims"}`);
    } catch (e) {
        log(`fail ${item.id}: ${e instanceof Error ? e.message : String(e)}`);
        await db.update(schema.media)
            .set({ transcodeStatus: "FAILED" })
            .where(eq(schema.media.id, item.id));
    }
}

export async function runWorkerLoop(): Promise<void> {
    log(`start (poll=${POLL_INTERVAL_MS}ms, batch=${BATCH_SIZE}, frames=${FRAME_COUNT})`);
    while (true) {
        try {
            const pending = await findPendingVideos();
            if (pending.length > 0) {
                for (const item of pending) {
                    await processMedia(item);
                }
            }
        } catch (e) {
            log(`loop error: ${e instanceof Error ? e.message : String(e)}`);
        }
        await sleep(POLL_INTERVAL_MS);
    }
}

// Jalankan langsung bila file di-eksekusi sebagai entrypoint.
const isMain = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMain) {
    runWorkerLoop().catch((e) => {
        console.error("[worker] fatal:", e);
        process.exit(1);
    });
}