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
import {
  audioTrack,
  media,
  organization,
  videoJob,
  videoJobClip,
  type RenderSettings,
} from "@sahabatkreator/db/schema";
import { getRenderAdapter, RenderError } from "@sahabatkreator/render";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
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
    .where(
      and(
        eq(videoJob.id, id),
        // Accept "queued" (normal) OR "rendering" (retry — status dari attempt sebelumnya)
        or(eq(videoJob.status, "queued"), eq(videoJob.status, "rendering")),
      ),
    )
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

    // Clip montage tambahan (urutan ascending; base video implisit di depan).
    // Hanya clip milik org yang dihitung — keamanan sama seperti base video.
    const clipRows = await db
      .select({ mediaId: videoJobClip.mediaId, order: videoJobClip.order })
      .from(videoJobClip)
      .innerJoin(media, eq(media.id, videoJobClip.mediaId))
      .where(
        and(
          eq(videoJobClip.videoJobId, videoJobId),
          eq(media.organizationId, job.organizationId),
          eq(media.type, "video"),
        ),
      )
      .orderBy(asc(videoJobClip.order));

    let clips: { storageKey: string }[] = [];
    if (clipRows.length) {
      const clipMedia = await db
        .select({ id: media.id, storageKey: media.storageKey })
        .from(media)
        .where(
          and(
            inArray(
              media.id,
              clipRows.map((c) => c.mediaId),
            ),
            eq(media.organizationId, job.organizationId),
          ),
        );
      // Re-join di app (urutan dari clipRows, lookup by id).
      const byId = new Map(clipMedia.map((m) => [m.id, m]));
      clips = clipRows
        .map((c) => byId.get(c.mediaId))
        .filter((m): m is { id: string; storageKey: string } => !!m && !!m.storageKey);
    }

    // --- presigned URL untuk Modal ---
    const datePrefix = `${job.organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const outputStorageKey = `${datePrefix}/render_${videoJobId}.mp4`;
    const thumbnailStorageKey = `${datePrefix}/render_${videoJobId}_thumb.jpg`;
    const srtStorageKey = job.settings.caption?.enabled
      ? `${datePrefix}/render_${videoJobId}.srt`
      : null;

    const clipUrls = await Promise.all(
      clips.map((c) => presignGet(c.storageKey)),
    );

    const [baseVideoUrl, voiceoverUrl, bgmUrl, outputUploadUrl, srtUploadUrl, thumbnailUploadUrl] = await Promise.all([
      presignGet(baseVideo.storageKey),
      voiceover?.storageKey ? presignGet(voiceover.storageKey) : Promise.resolve(null),
      bgm?.storageKey ? presignGet(bgm.storageKey) : Promise.resolve(null),
      presignPut(outputStorageKey, "video/mp4"),
      srtStorageKey ? presignPut(srtStorageKey, "application/x-subrip") : Promise.resolve(null),
      presignPut(thumbnailStorageKey, "image/jpeg"),
    ]);

    // --- panggil adapter (Modal) ---
    const result = await adapter.render(
      {
        jobId: videoJobId,
        baseVideoUrl,
        clipUrls,
        voiceoverUrl,
        bgmUrl,
        settings: job.settings,
        outputUploadUrl,
        srtUploadUrl,
        thumbnailUploadUrl,
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
      // Thumbnail (frame pertama output) di-generate Modal dan di-upload ke
      // R2 — media library memakainya sebagai poster kartu.
      thumbnailUrl: `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${thumbnailStorageKey}`,
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

    // Catatan: manifest galeri /renders dibangun dari DB saat request
    // (GET /renders/manifest) — tidak ada file publik yang ditulis. Flag
    // publishedToGallery di job sudah cukup; publish/unpublish adalah
    // operasi murni DB di route gallery.

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
    // throw agar BullMQ retry (kalau retryable) — jangan mark failed dulu,
    // karena status "failed" permanen di UI padahal worker masih retry.
    if (renderErr.retryable) throw error;
    await markVideoRenderFailed(videoJobId, renderErr.code, renderErr.message);
    return { ok: false };
  }
}

// ============================================================
// Manifest galeri /renders — dibangun dari DB saat request (GET
// /renders/manifest), BUKAN file renders.json publik di R2.
//
// Sebelumnya manifest ditulis ke R2 publik (media.sahabatkreator.com/
// renders.json) — itu directory listing anonim dari semua karya klien.
// Sekarang manifest di-serving melalui API terauthentikasi (halaman /renders
// sendiri ada di dalam RequireAuth), jadi tidak ada alasan publish file-nya.
// Flag publishedToGallery di video_job jadi satu-satunya sumber kebenaran.
// ============================================================
const MANIFEST_MAX_ENTRIES = 200;

export type RenderManifestEntry = {
  id: string;
  project: string;
  title: string;
  orientation: "landscape" | "portrait" | "square";
  videoUrl: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  commitSha: string;
  branch: string;
  renderedAt: string;
};

export type RenderManifest = {
  version: number;
  generatedAt: string;
  renders: RenderManifestEntry[];
};

/**
 * Bangun manifest galeri dari DB. Hanya job done + opt-in publikasi
 * (publishedToGallery=true). Dipanggil route GET /renders/manifest.
 */
export async function getRenderManifest(): Promise<RenderManifest> {
  // Output video ada di tabel media; base video juga di tabel media. drizzle-orm
  // 0.45 tidak punya helper alias top-level, jadi nama base diambil terpisah.
  const rows = await db
    .select({
      id: videoJob.id,
      settings: videoJob.settings,
      baseVideoMediaId: videoJob.baseVideoMediaId,
      outputUrl: media.url,
      outputSize: media.sizeBytes,
      outputWidth: media.width,
      outputHeight: media.height,
      outputDuration: media.durationSeconds,
      orgSlug: organization.slug,
      createdAt: videoJob.createdAt,
    })
    .from(videoJob)
    .innerJoin(media, eq(media.id, videoJob.outputMediaId))
    .innerJoin(organization, eq(organization.id, videoJob.organizationId))
    .where(and(eq(videoJob.status, "done"), eq(videoJob.publishedToGallery, true)))
    .orderBy(desc(videoJob.createdAt))
    .limit(MANIFEST_MAX_ENTRIES);

  const baseIds = [...new Set(rows.map((r) => r.baseVideoMediaId))];
  const baseRows = baseIds.length
    ? await db
        .select({ id: media.id, name: media.name })
        .from(media)
        .where(inArray(media.id, baseIds))
    : [];
  const baseNameById = new Map(baseRows.map((r) => [r.id, r.name]));

  // Drizzle jsonb select mengembalikan object mentah — cast aman untuk field yang dibaca.
  const renders: RenderManifestEntry[] = rows.map((r) => {
    const settings = r.settings as RenderSettings;
    const baseName = baseNameById.get(r.baseVideoMediaId);
    return {
      id: r.id,
      project: r.orgSlug,
      title: baseName ? baseName.replace(/\.[^.]+$/, "") : "render",
      orientation: settings.orientation,
      videoUrl: r.outputUrl,
      sizeBytes: r.outputSize ?? 0,
      durationSeconds: r.outputDuration ?? 0,
      width: r.outputWidth ?? 0,
      height: r.outputHeight ?? 0,
      commitSha: "",
      branch: "",
      renderedAt: r.createdAt.toISOString(),
    };
  });

  return { version: 1, generatedAt: new Date().toISOString(), renders };
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
