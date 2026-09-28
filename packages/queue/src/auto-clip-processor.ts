// Auto-clip processor — inti worker: claim job analisis, kirim source ke Modal
// clipper (ingest + transkrip), baca SRT, seleksi momen via OpenRouter, simpan
// kandidat ke video_job_segment.
//
// Ini job ANALISIS, bukan render. Output-nya daftar kandidat — tidak ada video
// yang di-render di sini. User pilih kandidatnya, baru fanOutSelectedSegments
// enqueue job render mode "single" biasa (invariant 1 job = 1 output tetap).
//
// RFC docs/rfc-auto-clip.md §6 (pipeline). Port yang dipindah dari
// opensource-clipping v1.12.0 HANYA get_analysis_prompt + skema JSON
// (viral_score/start_time/end_time/hook). _segments_to_srt, _trim_video,
// _whisper, _build_montage SUDAH ADA di sk_render.py / sk_clipper.py — jangan
// dobel. Provider Gemini/NVIDIA tidak dipindah: OpenRouter text-only cukup.
//
// Claim atomik: UPDATE video_job SET status='rendering' WHERE id=? AND
// status IN ('queued','rendering') AND mode='auto_clip' RETURNING. Filter mode
// WAJIB — video_job dipakai dua queue (render + auto-clip); tanpa ini fallback
// loop render bisa claim job analisis dan merender-nya sebagai video utuh.
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db, getPoolLimits, resolvePoolOrgIds } from "@sahabatkreator/db";
import {
  type AutoClipSettings,
  media,
  type RenderSettings,
  type UrlSourceTier,
  videoJob,
  videoJobSegment,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { chatCompletion, consumeAiCredits, getAiConfig } from "@sahabatkreator/publishing";
import { ClipperError, getClipperAdapter } from "@sahabatkreator/render";
import type { ConnectionOptions } from "bullmq";
import { and, asc, eq, or, sql } from "drizzle-orm";
import {
  buildAnalysisPrompt,
  type ClipCandidate,
  directionWithoutRanges,
  parseAnalysisResponse,
  parseExplicitRanges,
  srtToTranscript,
} from "./auto-clip-analysis";
import { getRedisConnection } from "./connection";
import { enqueueVideoRender } from "./video-render";
import { emitWebhookEvent } from "./webhook-emit";

// Re-export simbol yang dipakai test & sesama modul — implementasinya pindah ke
// auto-clip-analysis.ts (murni transformasi data, tanpa I/O).
export { type ClipCandidate, parseExplicitRanges };

const PRESIGN_EXPIRES = 3600; // 1 jam — ingest clipper maksimal 30 menit

/** TTL cache hasil analisis — transkrip + setting sama = kandidat sama */
const ANALYSIS_CACHE_TTL_S = 30 * 24 * 3600; // 30 hari

/**
 * Biaya kredit untuk 1 call analisis (transkrip panjang + 8 kandidat).
 * Sinkron dengan AI_CREDIT_COST di publishing/ai.ts. Limit pool per-user
 * DIPERIKSA saat analisis — kredit habis = job gagal (ai_quota_exceeded).
 */
const ANALYSIS_CREDIT_COST = 3;

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET
    ) {
      throw new Error("R2 belum dikonfigurasi — auto-clip butuh storage SRT/source");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function presignGet(storageKey: string): Promise<string> {
  return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }), {
    expiresIn: PRESIGN_EXPIRES,
  });
}

function presignPut(storageKey: string, mimeType: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey, ContentType: mimeType }),
    { expiresIn: PRESIGN_EXPIRES },
  );
}

/**
 * Claim satu job analisis secara atomik. Return null bila sudah diclaim runner
 * lain / status bukan queued / bukan mode auto_clip.
 */
async function claimAutoClipJob(
  id: string,
): Promise<{ id: string; organizationId: string; baseVideoMediaId: string } | null> {
  const [row] = await db
    .update(videoJob)
    .set({ status: "rendering", progress: 0, updatedAt: new Date() })
    .where(
      and(
        eq(videoJob.id, id),
        // Accept "queued" (normal) atau "rendering" (retry attempt sebelumnya)
        or(eq(videoJob.status, "queued"), eq(videoJob.status, "rendering")),
        // Guard mode: job analisis tidak boleh dirender sebagai video biasa
        // (dan sebaliknya — render job tidak boleh dianalisis).
        eq(videoJob.mode, "auto_clip"),
      ),
    )
    .returning({
      id: videoJob.id,
      organizationId: videoJob.organizationId,
      baseVideoMediaId: videoJob.baseVideoMediaId,
    });
  return row ?? null;
}

// ============================================================
// Cache Redis (pola sk:carousel-layout:* — RFC §6 langkah 3)
// ============================================================

function redisClientFromConn(conn: ConnectionOptions): import("ioredis").Redis {
  const { default: IORedis } = require("ioredis") as typeof import("ioredis");
  const url = (conn as { url?: string }).url ?? (typeof conn === "string" ? conn : "");
  return new IORedis(url);
}

async function readAnalysisCache(key: string): Promise<ClipCandidate[] | null> {
  const conn = getRedisConnection();
  if (!conn) return null;
  try {
    const client = redisClientFromConn(conn);
    try {
      const raw = await client.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ClipCandidate[];
      return Array.isArray(parsed) ? parsed : null;
    } finally {
      await client.quit().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function writeAnalysisCache(key: string, candidates: ClipCandidate[]): Promise<void> {
  const conn = getRedisConnection();
  if (!conn) return;
  try {
    const client = redisClientFromConn(conn);
    try {
      await client.set(key, JSON.stringify(candidates), "EX", ANALYSIS_CACHE_TTL_S);
    } finally {
      await client.quit().catch(() => undefined);
    }
  } catch {
    // cache gagal tulis bukan fatal — analisis tetap jalan, next job call ulang
  }
}

// ============================================================
// Inti processor
// ============================================================

/** Proses satu job analisis auto-clip (dipanggil BullMQ worker). */
export async function processAutoClipJob(
  videoJobId: string,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; candidateCount?: number }> {
  const adapter = getClipperAdapter();
  if (!adapter) {
    await markAutoClipFailed(
      videoJobId,
      "clipper_not_configured",
      "MODAL_CLIPPER_URL/MODAL_CLIPPER_TOKEN belum dikonfigurasi di worker",
    );
    return { ok: false };
  }

  const claimed = await claimAutoClipJob(videoJobId);
  if (!claimed) return { ok: false }; // sudah diclaim / bukan queued / bukan auto_clip

  try {
    const [job] = await db.select().from(videoJob).where(eq(videoJob.id, videoJobId)).limit(1);
    if (!job) throw new ClipperError("video_job tidak ditemukan", "job_not_found", false);
    if (job.mode !== "auto_clip") {
      throw new ClipperError("Job ini bukan mode auto_clip", "wrong_mode", false);
    }

    const clipSettings = (job.clipSettings as AutoClipSettings | null) ?? null;
    if (!clipSettings) {
      throw new ClipperError(
        "clipSettings kosong — job auto_clip tanpa konfigurasi",
        "bad_settings",
        false,
      );
    }

    // Progress ke DB (frontend polling) + job event BullMQ. Fire-and-forget
    // write — pola yang sama dengan render-processor (throttled oleh caller).
    const reportProgress = (percent: number): void => {
      onProgress?.(percent);
      db.update(videoJob)
        .set({ progress: Math.round(percent), updatedAt: new Date() })
        .where(eq(videoJob.id, videoJobId))
        .execute()
        .catch(() => undefined);
    };

    // --- muat source media (verify ownership via org job) ---
    const [baseVideo] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, job.baseVideoMediaId), eq(media.organizationId, job.organizationId)))
      .limit(1);
    if (!baseVideo)
      throw new ClipperError("Source video tidak ditemukan", "media_not_found", false);
    if (!baseVideo.storageKey) {
      throw new ClipperError("Source video tidak punya storageKey", "media_not_found", false);
    }

    // --- resolve source: URL T1/T2 (materialkan ke R2) atau media library ---
    const datePrefix = `${job.organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const srtStorageKey = `${datePrefix}/clipper_${videoJobId}.srt`;

    let sourceUrl: string;
    let sourceTier: UrlSourceTier = "t1";
    // Hanya untuk input URL: clipper upload source ke R2 setelah probe.
    // Input media library: storageKey sudah ada, presign GET biasa.
    const sourceUploadUrl = job.urlSource
      ? await presignPut(baseVideo.storageKey, "video/mp4")
      : null;

    if (job.urlSource) {
      sourceUrl = job.urlSource;
      sourceTier = job.urlSourceTier === "t2" ? "t2" : "t1";
    } else {
      sourceUrl = await presignGet(baseVideo.storageKey);
    }

    const srtUploadUrl = await presignPut(srtStorageKey, "application/x-subrip");

    // --- panggil clipper (Modal): download + probe + upload source + SRT ---
    reportProgress(5);
    const ingest = await adapter.ingest(
      {
        jobId: videoJobId,
        sourceUrl,
        sourceTier,
        srtUploadUrl,
        sourceUploadUrl,
        // Model transkripsi untuk analisis: small (default). Medium opsi
        // akurasi — sementara ikut setting caption render job (tiny/base
        // kurang untuk seleksi; small sweet spot CPU vs akurasi).
        whisperModel: "small",
        language: "auto", // deteksi; user lihat detectedLanguage di respons
        wordTimestamps: false, // seleksi butuh level segment saja — lebih cepat
      },
      (percent) => reportProgress(Math.min(60, percent * 0.6)),
    );

    // --- backfill metadata source (URL input: row media dibuat route dengan
    // placeholder; upload biasa: data ini sudah ada, update idempoten) ---
    await db
      .update(media)
      .set({
        sizeBytes: ingest.sizeBytes || baseVideo.sizeBytes,
        width: ingest.width || baseVideo.width || null,
        height: ingest.height || baseVideo.height || null,
        durationSeconds: Math.round(ingest.durationSeconds) || baseVideo.durationSeconds || null,
      })
      .where(eq(media.id, baseVideo.id));

    await db
      .update(videoJob)
      .set({ srtStorageKey, progress: 65, updatedAt: new Date() })
      .where(eq(videoJob.id, videoJobId));

    // --- baca SRT dari R2 (single source of truth: file yang sama dipakai
    // audit/captions; tidak ada response transcript duplikat) ---
    const srtText = await fetchSrtText(srtStorageKey);
    const transcript = srtToTranscript(srtText);
    if (!transcript.trim()) {
      throw new ClipperError(
        "Transkrip kosong setelah parse SRT (mungkin audio non-bicara)",
        "empty_transcript",
        false,
      );
    }

    // --- seleksi momen via OpenRouter ---
    const ranges = parseExplicitRanges(clipSettings.userDirection);
    const cleanDirection = clipSettings.userDirection
      ? directionWithoutRanges(clipSettings.userDirection, ranges)
      : undefined;
    const settings: AutoClipSettings = {
      ...clipSettings,
      // direction sudah dipisah rentangnya — prompt pakai instruksi bebas saja
      // (rentang disuntik sebagai aturan eksplisit di system/user prompt).
      userDirection: cleanDirection || undefined,
    };

    const config = await getAiConfig();
    if (!config) {
      throw new ClipperError(
        "OPENROUTER_API_KEY belum dikonfigurasi — analisis butuh AI",
        "ai_not_configured",
        false,
      );
    }

    // Cache key wajib mencakup userDirection: transkrip + setting sama tapi
    // direction beda = output beda (RFC §6 langkah 3).
    const cacheKey = analysisCacheKey({
      srt: srtText,
      settings: clipSettings,
      model: config.model,
    });

    let candidates = await readAnalysisCache(cacheKey);
    if (candidates?.length) {
      console.log(`[auto-clip] cache hit (${candidates.length} kandidat)`);
    } else {
      // Cek & konsumsi kredit AI pool per-user (limit asli, bukan tak
      // terbatas). Kredit habis = job GAGAL dengan pesan jelas (non-retryable)
      // — beda dengan layout-director yang fallback template.
      try {
        const orgIds = await resolvePoolOrgIds(job.organizationId);
        const limits = await getPoolLimits(orgIds);
        await consumeAiCredits(job.organizationId, limits.aiCreditsPerMonth, {
          userId: job.createdByUserId ?? undefined,
          action: "auto_clip_analysis",
          model: config.model,
          credits: ANALYSIS_CREDIT_COST,
        });
      } catch (error) {
        throw new ClipperError(
          error instanceof Error
            ? error.message
            : "Kredit AI habis — upgrade plan untuk menjalankan analisis auto-clip.",
          "ai_quota_exceeded",
          false,
        );
      }

      const { system, user, temperature } = buildAnalysisPrompt({
        transcript,
        settings,
        durationSeconds: ingest.durationSeconds,
        ranges,
      });

      reportProgress(75);
      const raw = await chatCompletion(config, system, user, {
        temperature,
        // Transkrip panjang + N kandidat + keep_segments → output JSON besar.
        // 2500 sering terpotong tengah JSON (finish_reason=length) → parse
        // gagal → ai_bad_response. Naikkan agar struktur JSON lengkap.
        maxTokens: 4096,
      });

      candidates = parseAnalysisResponse(raw, clipSettings, ingest.durationSeconds, ranges);
      if (!candidates?.length) {
        // Log raw response untuk debugging — Modal log cuma 1 hari (RFC §7.1),
        // tidak ada cara lain lihat output model saat ini.
        console.error(`[auto-clip] ai_bad_response raw (job ${videoJobId}):`, raw.slice(0, 2000));
        throw new ClipperError(
          "AI tidak mengembalikan kandidat valid (JSON tidak terparse / kosong)",
          "ai_bad_response",
          false,
        );
      }
      await writeAnalysisCache(cacheKey, candidates);
      console.log(`[auto-clip] analisis done: ${candidates.length} kandidat (1 call AI)`);
    }

    // --- bulk insert kandidat (replace row lama bila retry) ---
    await db.delete(videoJobSegment).where(eq(videoJobSegment.videoJobId, videoJobId));
    await db.insert(videoJobSegment).values(
      candidates.map((c, order) => ({
        id: `sk_vseg_${crypto.randomUUID().replace(/-/g, "")}`,
        videoJobId,
        order,
        startSec: c.start,
        endSec: c.end,
        title: c.title.slice(0, 200),
        viralScore: c.viralScore,
        hookText: c.hookText?.slice(0, 300) ?? null,
        keepSegments: c.keepSegments,
        explicitRange: c.explicitRange,
        status: "pending" as const,
      })),
    );

    await db
      .update(videoJob)
      .set({
        status: "done",
        progress: 100,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(videoJob.id, videoJobId));

    // Webhook keluar: analisis auto-clip selesai (best-effort)
    void emitWebhookEvent(job.organizationId, "render.completed", {
      jobId: videoJobId,
      kind: "auto-clip",
      candidateCount: candidates.length,
    });

    return { ok: true, candidateCount: candidates.length };
  } catch (error) {
    const clipErr =
      error instanceof ClipperError
        ? error
        : new ClipperError(
            error instanceof Error ? error.message : String(error),
            "auto_clip_unknown",
            true,
          );
    // throw retryable agar BullMQ retry; permanen → mark failed sekarang.
    if (clipErr.retryable) throw error;
    await markAutoClipFailed(videoJobId, clipErr.code, clipErr.message);
    return { ok: false };
  }
}

/** Baca file SRT dari R2 (buffer kecil — paling besar ~1-2 MB untuk 3 jam) */
async function fetchSrtText(storageKey: string): Promise<string> {
  try {
    const res = await getS3().send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
    );
    const stream = res.Body;
    if (!stream) throw new Error("SRT body kosong");
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } catch (error) {
    throw new ClipperError(
      `Gagal baca SRT dari R2 (${storageKey}): ${error instanceof Error ? error.message : String(error)}`,
      "srt_read_failed",
      true, // R2 transient error → retry
    );
  }
}

/** Key cache: hash transcript + setting (termasuk userDirection) + model */
function analysisCacheKey(opts: {
  srt: string;
  settings: AutoClipSettings;
  model: string;
}): string {
  const srtHash = Buffer.from(opts.srt).toString("base64");
  const settingsHash = Buffer.from(JSON.stringify(opts.settings)).toString("base64");
  return `sk:auto-clip-analysis:${Buffer.from(`${srtHash}::${settingsHash}::${opts.model}`).toString("base64")}`;
}

// ============================================================
// Fan-out — kandidat terpilih → job render mode single (RFC §6 langkah 6)
// ============================================================

/**
 * Fan-out kandidat status "selected" → job render biasa (mode single).
 *
 * Dipanggil route setelah user pilih kandidat (POST select). Setiap segmen
 * dapat job render sendiri: baseVideoMediaId = source, settings render dengan
 * trimStart/trimEnd = rentang segmen. Link balik via renderVideoJobId.
 *
 * Invariant 1 job = 1 output tetap utuh → queue, progress, polling, galeri
 * opt-in semuanya terpakai apa adanya, tanpa kode render baru.
 *
 * Idempoten: segmen yang sudah punya renderVideoJobId tidak di-enqueue ulang.
 */
export async function fanOutSelectedSegments(videoJobId: string): Promise<{ enqueued: string[] }> {
  const [job] = await db.select().from(videoJob).where(eq(videoJob.id, videoJobId)).limit(1);
  if (!job) return { enqueued: [] };
  if (job.mode !== "auto_clip") return { enqueued: [] };

  const clipSettings = (job.clipSettings as AutoClipSettings | null) ?? null;
  const baseSettings = (job.settings as RenderSettings | null) ?? null;
  if (!clipSettings || !baseSettings) return { enqueued: [] };

  const segments = await db
    .select()
    .from(videoJobSegment)
    .where(and(eq(videoJobSegment.videoJobId, videoJobId), eq(videoJobSegment.status, "selected")))
    .orderBy(asc(videoJobSegment.order));

  const enqueued: string[] = [];
  for (const seg of segments) {
    if (seg.renderVideoJobId) continue; // sudah pernah di-fan-out (idempotent)

    const childId = `sk_video_job_${crypto.randomUUID().replace(/-/g, "")}`;
    const childSettings: RenderSettings = {
      ...baseSettings,
      // Orientasi output dari clipSettings (bisa beda dari source 16:9)
      orientation: clipSettings.orientation,
      // false WAJIB: auto-clip tidak punya voiceover, output = audio asli
      // source. true → sk_render.py strip audio (-an) → klip bisu. Dipaksa
      // di sini juga menutup job lama yang settings-nya sudah terlanjur true.
      removeOriginalAudio: false,
      // Potong segmen ini dari source — sk_render.py sudah dukung trim.
      videoProcessing: {
        ...(baseSettings.videoProcessing ?? {}),
        trimStart: seg.startSec,
        trimEnd: seg.endSec,
      },
      caption: {
        ...baseSettings.caption,
        enabled: clipSettings.captionEnabled,
        // Dipaksa (sama seperti removeOriginalAudio): klip ditranskripsi ulang
        // dari audio hasil trim, deteksi bahasa otomatis + small agar sinkron
        // dengan analisis. Job lama yang settings-nya masih "id"+base sering
        // menghasilkan caption rusak pada sumber non-indonesia/berisik.
        language: "auto",
        model: "small",
      },
    };

    await db.transaction(async (tx) => {
      await tx.insert(videoJob).values({
        id: childId,
        organizationId: job.organizationId,
        baseVideoMediaId: job.baseVideoMediaId,
        mode: "single",
        settings: childSettings,
        status: "queued",
        createdByUserId: job.createdByUserId ?? null,
      });
      // Segmen → rendering; selesai → "rendered" di update oleh render
      // processor (hook renderVideoJobId di akhir job render sukses).
      await tx
        .update(videoJobSegment)
        .set({ status: "rendering", renderVideoJobId: childId })
        .where(eq(videoJobSegment.id, seg.id));
    });

    const jobId = await enqueueVideoRender(childId);
    if (!jobId) {
      console.warn(`[auto-clip] Redis tidak ada — child job ${childId} menunggu fallback polling`);
    }
    enqueued.push(childId);
  }

  return { enqueued };
}

// ============================================================
// Status helpers
// ============================================================

/** Tandai job analisis failed permanen */
export async function markAutoClipFailed(
  videoJobId: string,
  code: string,
  message: string,
): Promise<void> {
  await db
    .update(videoJob)
    .set({ status: "failed", errorCode: code, errorMessage: message, updatedAt: new Date() })
    .where(and(eq(videoJob.id, videoJobId), sql`status NOT IN ('done')`));

  // Webhook keluar: analisis gagal permanen (best-effort)
  const [job] = await db
    .select({ organizationId: videoJob.organizationId })
    .from(videoJob)
    .where(eq(videoJob.id, videoJobId))
    .limit(1);
  if (job) {
    void emitWebhookEvent(job.organizationId, "render.failed", {
      jobId: videoJobId,
      kind: "auto-clip",
      errorCode: code,
      errorMessage: message,
    });
  }
}

/**
 * Fallback polling: claim job auto_clip queued, proses berurutan (Redis kosong).
 * Filter mode WAJIB — tanpa ini loop ini akan mengambil job render biasa.
 */
export async function processAutoClipDueJobs(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  const rows = await db
    .select({ id: videoJob.id })
    .from(videoJob)
    .where(and(eq(videoJob.status, "queued"), eq(videoJob.mode, "auto_clip")))
    .limit(5);

  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await processAutoClipJob(row.id);
      if (result.ok) done++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { claimed: rows.length, done, failed };
}
