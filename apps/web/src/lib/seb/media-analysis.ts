import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@sahabat-kreator/db";
import { callOpenRouter, getOpenRouterSettings } from "@/lib/ai/openrouter";
import { env } from "@sahabat-kreator/env/server";

function getPublicR2Url(key: string): string {
    if (env.R2_CUSTOM_DOMAIN) return `https://${env.R2_CUSTOM_DOMAIN}/${key}`;
    return `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.dev/${key}`;
}

function frameKeyFor(organizationId: string, mediaId: string, index: number): string {
    return `orgs/${organizationId}/media-frames/${mediaId}/frame-${index}.jpg`;
}

function mediaFrameUrls(organizationId: string, mediaId: string, frameCount: number): string[] {
    const urls: string[] = [];
    for (let i = 0; i <= frameCount; i++) urls.push(frameKeyFor(organizationId, mediaId, i));
    return urls;
}

/** Daftar media yang sudah diproses worker (punya frame). */
export async function listAnalyzableMedia(organizationId: string, limit = 20, offset = 0) {
    const items = await db.query.media.findMany({
        where: and(eq(schema.media.organizationId, organizationId), eq(schema.media.transcodeStatus, "DONE")),
        orderBy: [desc(schema.media.createdAt)],
        limit,
        offset,
        columns: { id: true, filename: true, mimeType: true, url: true, thumbnailUrl: true, duration: true, width: true, height: true, createdAt: true },
    });
    return items.map((m) => ({
        id: m.id,
        filename: m.filename,
        type: m.mimeType.startsWith("video/") ? "video" : "image",
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
        duration: m.duration,
        width: m.width,
        height: m.height,
        createdAt: m.createdAt.toISOString(),
    }));
}

/** Analisis visual satu media (gambar atau video) via vision model. */
export async function analyzeMediaForSeb(organizationId: string, mediaId: string) {
    const settings = getOpenRouterSettings();
    if (!settings) {
        throw new Error("OpenRouter belum dikonfigurasi. Atur OPENROUTER_API_KEY di environment untuk mengaktifkan Seb.");
    }

    const media = await db.query.media.findFirst({
        where: and(eq(schema.media.id, mediaId), eq(schema.media.organizationId, organizationId)),
        columns: {
            id: true,
            mimeType: true,
            thumbnailUrl: true,
            transcodeStatus: true,
            altText: true,
            filename: true,
            url: true,
        },
    });
    if (!media) throw new Error("Media tidak ditemukan.");

    const isVideo = media.mimeType.startsWith("video/");
    if (isVideo && media.transcodeStatus !== "DONE") {
        throw new Error("Video belum diproses worker. Coba lagi beberapa saat.");
    }

    // Video: pakai frame hasil ekstrak worker. Gambar: pakai URL media langsung
    // (worker hanya memproses video, frame R2 untuk gambar tidak ada).
    const frameCount = isVideo ? 4 : 0;
    const imageUrls: string[] = isVideo
        ? mediaFrameUrls(organizationId, mediaId, frameCount).map((key) => getPublicR2Url(key))
        : [media.url];

    const imageContent: Array<{ type: "image_url"; image_url: { url: string } }> = imageUrls.map((url) => ({
        type: "image_url",
        image_url: { url },
    }));

    const raw = await callOpenRouter(
        settings,
        [
            {
                role: "system",
                content:
                    "You are Seb, a visual content analyst for a social media manager. Return strict JSON only. Use only what is visible in the supplied image(s). Do not invent text, brand details, or products that are not visible.",
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Analisis visual konten media berikut (${isVideo ? `${frameCount + 1} frame video` : "gambar"}). Kembalikan JSON persis dengan bentuk ini: {"ocrText":"string|null","sceneSummary":"string","analysis":{"category":"CONTENT_STRATEGY|CAPTION|CREATIVE|VIDEO|TIMING|HASHTAG|PLATFORM|COMPETITOR|BRAND","visualHooks":["string"],"strengths":["string"],"weaknesses":["string"],"captionSuggestions":["string"],"hasTextOverlay":false,"brandConsistency":"string|null","firstFrameHook":"string|null","bestPracticeScore":0-100},"confidence":0-1}. Field null bila tidak terlihat. Deskripsikan secara konkret apa yang terlihat di gambar/frame.`,
                    },
                    ...imageContent,
                ],
            },
        ],
        1800,
        true,
    );

    const parsed = safeJsonParse<{
        ocrText?: string | null;
        sceneSummary?: string;
        analysis?: Record<string, unknown>;
        confidence?: number;
    }>(raw) || {};

    const analysis = typeof parsed.analysis === "object" && parsed.analysis !== null ? parsed.analysis : {};
    const stored = await db.insert(schema.sebMediaAnalysis)
        .values({
            id: randomUUID(),
            organizationId,
            mediaId,
            mediaHash: media.id,
            model: settings.model,
            frameCount: frameCount + 1,
            ocrText: typeof parsed.ocrText === "string" ? parsed.ocrText : null,
            transcript: null,
            sceneSummary: typeof parsed.sceneSummary === "string" ? parsed.sceneSummary : null,
            analysis,
        })
        .onConflictDoNothing()
        .returning({ id: schema.sebMediaAnalysis.id });

    return {
        id: stored[0]?.id,
        mediaId,
        ocrText: typeof parsed.ocrText === "string" ? parsed.ocrText : null,
        sceneSummary: typeof parsed.sceneSummary === "string" ? parsed.sceneSummary : null,
        analysis,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
}

function safeJsonParse<T>(text: string): T | null {
    const cleaned = text.trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
    } catch {
        return null;
    }
}
