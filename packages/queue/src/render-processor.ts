// Render processor — inti worker: claim job, siapkan presigned URL, panggil
// adapter (Modal), simpan output ke media library.
//
// Dua mode pemanggilan:
// - processVideoRenderJob(id)   — via BullMQ worker (Redis ada)
// - processVideoRenderDueJobs() — via DB polling fallback (Redis kosong)
//
// Claim atomik: UPDATE video_job SET status='rendering' WHERE id=? AND
// status='queued' RETURNING — mencegah double-processing saat dua runner
// (BullMQ + fallback loop) aktif bersamaan. Pola yang sama dipakai publish
// (claimPostById).
import { db } from "@sahabatkreator/db";
import { audioTrack, media, videoJob } from "@sahabatkreator/db/schema";
import { getRenderAdapter, RenderError } from "@sahabatkreator/render";
import { and, eq, sql } from "drizzle-orm";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@sahabatkreator/env/server";

const PRESIGN_EXPIRES = 3600; // 1 jam — render Modal maksimal 20 menit

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
      throw new Error("R2 belum dikonfigurasi — render butuh storage untuk input/output");
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
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
    { expiresIn: PRESIGN_EXPIRES },
  );
}

function presignPut(storageKey: string, mimeType: string): Promise<string> {
  return getSignedUrl(
    getS3(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey, ContentType: mimeType }),
    { expiresIn: PRESIGN_EXPIRES },
  );
}

/**
 * Claim satu job secara atomik. Return data job bila berhasil claim, null bila
 * sudah diclaim runner lain / status bukan queued.
 *
 * SELECT ... FOR UPDATE tidak dipakai (holding lock selama render buruk);
 * pakai conditional UPDATE seperti claimPostById.
 */
async function claimJob(
  id: string,
): Promise<{ id: string; organizationId: string; baseVideoMediaId: string } | null> {
  const [row] = await db
    .update(videoJob)
    .set({ status: "rendering", progress: 0, updatedAt: new Date() })
    .where(and(eq(videoJob.id, id), eq(videoJob.status, "queued")))
    .returning({
      id: videoJob.id,
      organizationId: videoJob.organizationId,
      baseVideoMediaId: videoJob.baseVideoMediaId,
    });
  return row ?? null;
}

/** Proses satu job render (dipanggil BullMQ worker). Return ringkasan hasil. */
export async function processVideoRenderJob(
  videoJobId: string,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean; outputMediaId?: string }> {
  const adapter = getRenderAdapter();
  if (!adapter) {
    await markVideoRenderFailed(
      videoJobId,
      "render_not_configured",
      "MODAL_TOKEN/MODAL_RENDER_URL belum dikonfigurasi di worker",
    );
    return { ok: false };
  }

  const claimed = await claimJob(videoJobId);
  if (!claimed) return { ok: false }; // sudah diclaim / bukan queued

  try {
    // --- muat input ---
    const [job] = await db.select().from(videoJob).where(eq(videoJob.id, videoJobId)).limit(1);
    if (!job) throw new RenderError("video_job tidak ditemukan", "job_not_found", false);

    const [baseVideo] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, job.baseVideoMediaId), eq(media.organizationId, job.organizationId)))
      .limit(1);
    if (!baseVideo) throw new RenderError("Base video tidak ditemukan", "media_not_found", false);
    if (!baseVideo.storageKey) throw new RenderError("Base video tidak punya storageKey", "media_not_found", false);

    let voiceover = null;
    if (job.voiceoverMediaId) {
      [voiceover] = await db
        .select()
        .from(media)
        .where(and(eq(media.id, job.voiceoverMediaId), eq(media.organizationId, job.organizationId)))
        .limit(1);
    }

    let bgm = null;
    if (job.bgmAudioTrackId) {
      [bgm] = await db
        .select()
        .from(audioTrack)
        .where(and(eq(audioTrack.id, job.bgmAudioTrackId), eq(audioTrack.organizationId, job.organizationId)))
        .limit(1);
    }

    // --- presigned URL untuk Modal ---
    const outputStorageKey = `${job.organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/render_${videoJobId}.mp4`;
    const srtStorageKey = job.settings.caption?.enabled
      ? `${job.organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/render_${videoJobId}.srt`
      : null;

    const [baseVideoUrl, voiceoverUrl, bgmUrl, outputUploadUrl, srtUploadUrl] = await Promise.all([
      presignGet(baseVideo.storageKey),
      voiceover?.storageKey ? presignGet(voiceover.storageKey) : Promise.resolve(null),
      bgm?.storageKey ? presignGet(bgm.storageKey) : Promise.resolve(null),
      presignPut(outputStorageKey, "video/mp4"),
      srtStorageKey ? presignPut(srtStorageKey, "application/x-subrip") : Promise.resolve(null),
    ]);

    // --- panggil adapter (Modal) ---
    const result = await adapter.render(
      {
        jobId: videoJobId,
        baseVideoUrl,
        voiceoverUrl,
        bgmUrl,
        settings: job.settings,
        outputUploadUrl,
        srtUploadUrl,
      },
      (percent) => {
        onProgress?.(percent);
        // throttled update — setiap render progress callback
        db.update(videoJob)
          .set({ progress: Math.round(percent), updatedAt: new Date() })
          .where(eq(videoJob.id, videoJobId))
          .execute()
          .catch(() => undefined);
      },
    );

    // --- simpan output ke media library ---
    const outputId = `sk_media_${crypto.randomUUID().replace(/-/g, "")}`;
    const outputName = `render-${baseVideo.name.replace(/\.[^.]+$/, "")}.mp4`;
    await db.insert(media).values({
      id: outputId,
      organizationId: job.organizationId,
      name: outputName,
      type: "video",
      storageKey: outputStorageKey,
      url: `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${outputStorageKey}`,
      mimeType: "video/mp4",
      sizeBytes: result.sizeBytes,
      width: result.width,
      height: result.height,
      durationSeconds: Math.round(result.durationSeconds),
      uploadedByUserId: job.createdByUserId ?? null,
    });

    await db
      .update(videoJob)
      .set({
        status: "done",
        progress: 100,
        outputMediaId: outputId,
        srtStorageKey,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(videoJob.id, videoJobId));

    return { ok: true, outputMediaId: outputId };
  } catch (error) {
    const renderErr =
      error instanceof RenderError
        ? error
        : new RenderError(
            error instanceof Error ? error.message : String(error),
            "render_unknown",
            true,
          );
    await markVideoRenderFailed(videoJobId, renderErr.code, renderErr.message);
    // throw agar BullMQ retry (kalau retryable)
    if (renderErr.retryable) throw error;
    return { ok: false };
  }
}

/** Tandai job failed permanen */
export async function markVideoRenderFailed(
  videoJobId: string,
  code: string,
  message: string,
): Promise<void> {
  await db
    .update(videoJob)
    .set({ status: "failed", errorCode: code, errorMessage: message, updatedAt: new Date() })
    .where(and(eq(videoJob.id, videoJobId), sql`status NOT IN ('done')`));
}

/** Fallback polling: claim semua job queued, proses berurutan (Redis kosong) */
export async function processVideoRenderDueJobs(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  const rows = await db
    .select({ id: videoJob.id })
    .from(videoJob)
    .where(eq(videoJob.status, "queued"))
    .limit(5);

  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await processVideoRenderJob(row.id);
      if (result.ok) done++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { claimed: rows.length, done, failed };
}
