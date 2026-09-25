// API Auto-clip — job analisis video panjang → kandidat klip pendek.
//
// Satu job analisis = 1 row video_job (mode auto_clip) + N kandidat di
// video_job_segment. Render video TIDAK terjadi di job ini — user pilih
// kandidat dulu (POST /:id/select), baru fan-out ke job render biasa.
//
// Input dua jalur (RFC §2):
//  - upload biasa: baseVideoMediaId (media library milik org, sudah di R2)
//  - paste-link T1/T2: sourceUrl + tier → media row placeholder dibuat route,
//    source dimaterialkan ke R2 oleh clipper saat ingest (worker backfill
//    metadata). T3 (platform scraping) TIDAK ADA — §2 ditahan total.
//
// Fitur nonaktif (503 jelas) bila Modal clipper belum dikonfigurasi —
// graceful degradation sama seperti route video. Lihat RFC §8.
import { db } from "@sahabatkreator/db";
import {
  type AutoClipSettings,
  DEFAULT_AUTO_CLIP_SETTINGS,
  DEFAULT_RENDER_SETTINGS,
  media,
  type RenderSettings,
  type UrlSourceTier,
  videoJob,
  videoJobSegment,
} from "@sahabatkreator/db/schema";
import {
  cancelAutoClipJob,
  enqueueAutoClip,
  fanOutSelectedSegments,
  parseExplicitRanges,
} from "@sahabatkreator/queue";
import { isClipperConfigured } from "@sahabatkreator/render";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const autoClipRoute = new Hono();

/**
 * Konfigurasi analisis. Default eksplisit per field (bukan .default({}) kosong
// — zod v4 footgun: default harus full shape; DEFAULT_AUTO_CLIP_SETTINGS punya
// default semua field jadi aman, tapi tulis eksplisit biar jelas).
 */
const clipSettingsSchema = z
  .object({
    targetClipCount: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(DEFAULT_AUTO_CLIP_SETTINGS.targetClipCount),
    minDurationSec: z.number().min(5).max(600).default(DEFAULT_AUTO_CLIP_SETTINGS.minDurationSec),
    maxDurationSec: z.number().min(10).max(1800).default(DEFAULT_AUTO_CLIP_SETTINGS.maxDurationSec),
    orientation: z
      .enum(["portrait", "landscape", "square"])
      .default(DEFAULT_AUTO_CLIP_SETTINGS.orientation),
    outputLanguage: z.string().min(2).max(20).default(DEFAULT_AUTO_CLIP_SETTINGS.outputLanguage),
    userDirection: z.string().max(1000).trim().nullish(),
    captionEnabled: z.boolean().default(DEFAULT_AUTO_CLIP_SETTINGS.captionEnabled),
  })
  .refine((s) => s.minDurationSec <= s.maxDurationSec, {
    message: "minDurationSec tidak boleh lebih besar dari maxDurationSec",
  });

/** Default settings render dasar untuk job anak (zod v4: .default butuh full shape) */
const RENDER_BASE_DEFAULTS = {
  resolution: "1080p" as const,
  removeOriginalAudio: true,
  bgmVolume: 0.3,
};

const createSchema = z
  .object({
    // Salah satu dari dua input (URL diprioritaskan bila keduanya terisi).
    sourceUrl: z.string().url().max(2000).trim().nullish(),
    sourceTier: z.enum(["t1", "t2"]).default("t1"),
    baseVideoMediaId: z.string().min(1).nullish(),
    clipSettings: clipSettingsSchema.default(DEFAULT_AUTO_CLIP_SETTINGS),
    // Base settings render untuk job anak (orientation di-override dari
    // clipSettings saat fan-out). Pakai default kalau tidak disertakan.
    renderSettings: z
      .object({
        resolution: z.enum(["720p", "1080p"]).default("1080p"),
        removeOriginalAudio: z.boolean().default(true),
        bgmVolume: z.number().min(0).max(1).default(0.3),
      })
      .default(RENDER_BASE_DEFAULTS),
  })
  .refine((s) => Boolean(s.sourceUrl || s.baseVideoMediaId), {
    message: "Wajib isi sourceUrl atau baseVideoMediaId",
    path: ["sourceUrl"],
  });

/** Storage key placeholder untuk source URL — worker isi setelah clipper upload */
function sourceStorageKey(organizationId: string, mediaId: string): string {
  const now = new Date();
  const datePrefix = `${organizationId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${datePrefix}/clipper_source_${mediaId}.mp4`;
}

/** GET /auto-clip — list job analisis org (terbaru di atas) + jumlah kandidat */
autoClipRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

    const jobs = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        progress: videoJob.progress,
        clipSettings: videoJob.clipSettings,
        urlSource: videoJob.urlSource,
        urlSourceTier: videoJob.urlSourceTier,
        errorCode: videoJob.errorCode,
        errorMessage: videoJob.errorMessage,
        createdAt: videoJob.createdAt,
        updatedAt: videoJob.updatedAt,
        baseVideoName: media.name,
        baseVideoThumbnailUrl: media.thumbnailUrl,
        baseVideoDuration: media.durationSeconds,
      })
      .from(videoJob)
      .innerJoin(media, eq(media.id, videoJob.baseVideoMediaId))
      .where(and(eq(videoJob.organizationId, ctx.organization.id), eq(videoJob.mode, "auto_clip")))
      .orderBy(desc(videoJob.createdAt))
      .limit(limit);

    if (jobs.length) {
      const segCounts = await db
        .select({
          videoJobId: videoJobSegment.videoJobId,
          count: sql<number>`count(*)`,
        })
        .from(videoJobSegment)
        .where(
          inArray(
            videoJobSegment.videoJobId,
            jobs.map((j) => j.id),
          ),
        )
        .groupBy(videoJobSegment.videoJobId);
      const counts = new Map(segCounts.map((s) => [s.videoJobId, Number(s.count)]));
      for (const j of jobs) {
        (j as { candidateCount?: number }).candidateCount = counts.get(j.id) ?? 0;
      }
    }

    return c.json({ jobs, clipperEnabled: isClipperConfigured() });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /auto-clip — buat job analisis baru (upload atau paste-link T1/T2) */
autoClipRoute.post("/", async (c) => {
  try {
    if (!isClipperConfigured()) {
      return c.json(
        {
          message:
            "Fitur auto-clip belum dikonfigurasi. Set MODAL_CLIPPER_URL dan MODAL_CLIPPER_TOKEN di server.",
        },
        503,
      );
    }

    const ctx = await requireOrg(c);
    const body = createSchema.parse(await c.req.json());
    const clipSettings = body.clipSettings as AutoClipSettings;

    // --- resolve input ---
    let baseVideoMediaId: string;
    let urlSource: string | null = null;
    let urlSourceTier: UrlSourceTier | null = null;

    if (body.sourceUrl) {
      // T1/T2 paste-link: buat media row placeholder. storageKey = lokasi
      // yang akan diisi clipper saat ingest (worker backfill metadata).
      const mediaId = generateId("media");
      const storageKey = sourceStorageKey(ctx.organization.id, mediaId);
      const name = (() => {
        try {
          const u = new URL(body.sourceUrl);
          return `${u.hostname} — ${u.pathname.split("/").pop() || "source"}`.slice(0, 120);
        } catch {
          return "Source URL";
        }
      })();

      await db.insert(media).values({
        id: mediaId,
        organizationId: ctx.organization.id,
        name,
        type: "video",
        storageKey,
        url: body.sourceUrl, // URL asli untuk audit + klik-through
        mimeType: "video/mp4",
        sizeBytes: 0, // di-backfill worker setelah probe
        source: body.sourceTier === "t2" ? "url_t2" : "url_t1",
        uploadedByUserId: ctx.user.id,
      });

      baseVideoMediaId = mediaId;
      urlSource = body.sourceUrl;
      urlSourceTier = body.sourceTier;
    } else if (body.baseVideoMediaId) {
      const [existing] = await db
        .select()
        .from(media)
        .where(
          and(eq(media.id, body.baseVideoMediaId), eq(media.organizationId, ctx.organization.id)),
        )
        .limit(1);
      if (!existing) return c.json({ message: "Source video tidak ditemukan" }, 404);
      if (existing.type !== "video") {
        return c.json({ message: "Media yang dipilih harus berupa video" }, 400);
      }
      baseVideoMediaId = existing.id;
    } else {
      // unreachable — zod refine sudah jaga
      return c.json({ message: "Wajib isi sourceUrl atau baseVideoMediaId" }, 400);
    }

    // Settings render dasar untuk job anak (dipakai saat fan-out; orientation
    // + captionEnabled di-override dari clipSettings di sana).
    const renderSettings: RenderSettings = {
      ...DEFAULT_RENDER_SETTINGS,
      orientation: clipSettings.orientation,
      resolution: body.renderSettings.resolution,
      removeOriginalAudio: body.renderSettings.removeOriginalAudio,
      bgmVolume: body.renderSettings.bgmVolume,
      caption: {
        ...DEFAULT_RENDER_SETTINGS.caption,
        enabled: clipSettings.captionEnabled,
      },
    };

    const id = generateId("video_job");
    await db.insert(videoJob).values({
      id,
      organizationId: ctx.organization.id,
      baseVideoMediaId,
      mode: "auto_clip",
      urlSource,
      urlSourceTier,
      clipSettings,
      settings: renderSettings,
      status: "queued",
      createdByUserId: ctx.user.id,
    });

    const enqueued = await enqueueAutoClip(id);
    if (!enqueued) {
      console.warn(`[auto-clip] Redis tidak ada — job ${id} menunggu fallback polling`);
    }

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "auto_clip.created",
      targetType: "video_job",
      targetId: id,
    });

    const [row] = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        progress: videoJob.progress,
        createdAt: videoJob.createdAt,
      })
      .from(videoJob)
      .where(eq(videoJob.id, id))
      .limit(1);

    // Beri tahu UI rentang eksplisit apa yang terdeteksi dari arahan user
    // (transparansi: user tahu sistem membaca "2:00-2:50" sebagai pengecualian).
    const detectedRanges = parseExplicitRanges(clipSettings.userDirection);

    return c.json({ job: row, detectedRanges }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /auto-clip/:id — detail job + daftar kandidat (status render anak juga) */
autoClipRoute.get("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [job] = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        progress: videoJob.progress,
        clipSettings: videoJob.clipSettings,
        urlSource: videoJob.urlSource,
        urlSourceTier: videoJob.urlSourceTier,
        srtStorageKey: videoJob.srtStorageKey,
        errorCode: videoJob.errorCode,
        errorMessage: videoJob.errorMessage,
        createdAt: videoJob.createdAt,
        updatedAt: videoJob.updatedAt,
        baseVideoName: media.name,
        baseVideoThumbnailUrl: media.thumbnailUrl,
        baseVideoDuration: media.durationSeconds,
      })
      .from(videoJob)
      .innerJoin(media, eq(media.id, videoJob.baseVideoMediaId))
      .where(and(eq(videoJob.id, id), eq(videoJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!job) return c.json({ message: "Job tidak ditemukan" }, 404);

    // Kandidat + status job render anak (join self-reference video_job)
    const segments = await db
      .select({
        id: videoJobSegment.id,
        order: videoJobSegment.order,
        startSec: videoJobSegment.startSec,
        endSec: videoJobSegment.endSec,
        title: videoJobSegment.title,
        viralScore: videoJobSegment.viralScore,
        hookText: videoJobSegment.hookText,
        explicitRange: videoJobSegment.explicitRange,
        status: videoJobSegment.status,
        renderVideoJobId: videoJobSegment.renderVideoJobId,
        renderStatus: videoJob.status,
        renderProgress: videoJob.progress,
        outputMediaId: videoJob.outputMediaId,
      })
      .from(videoJobSegment)
      .leftJoin(videoJob, eq(videoJob.id, videoJobSegment.renderVideoJobId))
      .where(eq(videoJobSegment.videoJobId, id))
      .orderBy(asc(videoJobSegment.order));

    return c.json({ job, segments });
  } catch (error) {
    return errorResponse(error);
  }
});

const selectSchema = z.object({
  segmentIds: z.array(z.string().min(1)).min(1, "Pilih minimal satu kandidat").max(20),
});

/**
 * POST /auto-clip/:id/select — pilih kandidat → fan-out job render biasa.
 *
 * Idempoten: kandidat yang sudah punya render job tidak di-enqueue ulang
 * (jaga di worker). Kandidat dengan status "rendered" tidak bisa dipilih ulang
 * (job render-nya sudah ada output).
 */
autoClipRoute.post("/:id/select", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");
    const body = selectSchema.parse(await c.req.json());

    const [job] = await db
      .select({ id: videoJob.id, status: videoJob.status })
      .from(videoJob)
      .where(and(eq(videoJob.id, id), eq(videoJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!job) return c.json({ message: "Job tidak ditemukan" }, 404);
    if (job.status !== "done") {
      return c.json({ message: "Analisis belum selesai — tunggu kandidat tersedia" }, 409);
    }

    // Validasi: segment milik job ini + masih bisa dipilih (pending).
    const rows = await db
      .select({ id: videoJobSegment.id, status: videoJobSegment.status })
      .from(videoJobSegment)
      .where(and(eq(videoJobSegment.videoJobId, id), inArray(videoJobSegment.id, body.segmentIds)));
    if (rows.length !== body.segmentIds.length) {
      return c.json({ message: "Satu atau beberapa kandidat tidak valid" }, 400);
    }
    const locked = rows.filter((r) => r.status === "rendered");
    if (locked.length) {
      return c.json(
        {
          message: `${locked.length} kandidat sudah selesai dirender dan tidak bisa dipilih ulang`,
        },
        409,
      );
    }

    await db
      .update(videoJobSegment)
      .set({ status: "selected" })
      .where(and(eq(videoJobSegment.videoJobId, id), inArray(videoJobSegment.id, body.segmentIds)));

    // Fan-out: tiap kandidat → job render mode single (queue + progress UI
    // render terpakai apa adanya). Idempoten di level worker.
    const { enqueued } = await fanOutSelectedSegments(id);

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "auto_clip.selected",
      targetType: "video_job",
      targetId: id,
    });

    return c.json({ ok: true, enqueuedCount: enqueued.length, renderJobIds: enqueued });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /auto-clip/:id — batalkan job queued, atau hapus job terminal */
autoClipRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [row] = await db
      .select({ id: videoJob.id, status: videoJob.status })
      .from(videoJob)
      .where(and(eq(videoJob.id, id), eq(videoJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!row) return c.json({ message: "Job tidak ditemukan" }, 404);
    if (row.status === "rendering" || row.status === "uploading") {
      return c.json({ message: "Job sedang diproses, tidak bisa dibatalkan" }, 409);
    }

    if (row.status === "failed" || row.status === "canceled") {
      // Job terminal — hapus dari riwayat. Kandidat + job render anak (bila
      // sudah fan-out) tetap ada (cascade hapus kandidat via FK; job render
      // anak punya pemiliknya sendiri di video_job).
      await db.delete(videoJob).where(eq(videoJob.id, id));
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: "auto_clip.deleted",
        targetType: "video_job",
        targetId: id,
      });
      return c.json({ ok: true });
    }

    // status queued → batalkan
    await db
      .update(videoJob)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(videoJob.id, id));

    await cancelAutoClipJob(id);

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "auto_clip.canceled",
      targetType: "video_job",
      targetId: id,
    });
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /auto-clip/:id/retry — buat ulang job analisis dari konfigurasi gagal.
 *
 * Berbeda dari retry video render: sumber (media row URL) DIPAKAI ULANG —
 * storageKey-nya sudah berisi source hasil upload clipper sebelumnya, jadi
 * ingest tidak perlu download ulang dari URL yang mungkin kedaluwarsa.
 */
autoClipRoute.post("/:id/retry", async (c) => {
  try {
    if (!isClipperConfigured()) {
      return c.json(
        {
          message:
            "Fitur auto-clip belum dikonfigurasi. Set MODAL_CLIPPER_URL dan MODAL_CLIPPER_TOKEN di server.",
        },
        503,
      );
    }

    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [job] = await db
      .select()
      .from(videoJob)
      .where(and(eq(videoJob.id, id), eq(videoJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!job) return c.json({ message: "Job tidak ditemukan" }, 404);
    if (job.status !== "failed" && job.status !== "canceled") {
      return c.json({ message: "Hanya job gagal atau dibatalkan yang bisa diulang" }, 409);
    }

    const newId = generateId("video_job");
    // Bila source asli URL dan ingest SEBELUMNYA sudah upload source-nya ke R2
    // (media.sizeBytes > 0 = worker backfill sudah jalan), retry tidak butuh
    // URL lagi — aman dari link kedaluwarsa. Bila gagal sebelum source tersimpan
    // (download/probe gagal), pertahankan URL agar ingest mencoba ulang.
    const [sourceMedia] = await db
      .select({ sizeBytes: media.sizeBytes })
      .from(media)
      .where(eq(media.id, job.baseVideoMediaId))
      .limit(1);
    const sourceMaterialized = Boolean(sourceMedia && sourceMedia.sizeBytes > 0);

    await db.insert(videoJob).values({
      id: newId,
      organizationId: job.organizationId,
      baseVideoMediaId: job.baseVideoMediaId,
      mode: "auto_clip",
      urlSource: sourceMaterialized ? null : job.urlSource,
      urlSourceTier: sourceMaterialized ? null : job.urlSourceTier,
      clipSettings: job.clipSettings as AutoClipSettings,
      settings: job.settings as RenderSettings,
      status: "queued",
      createdByUserId: ctx.user.id,
    });

    const enqueued = await enqueueAutoClip(newId);
    if (!enqueued) {
      console.warn(`[auto-clip] Redis tidak ada — job ${newId} menunggu fallback polling`);
    }

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "auto_clip.retried",
      targetType: "video_job",
      targetId: newId,
    });

    const [row] = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        progress: videoJob.progress,
        createdAt: videoJob.createdAt,
      })
      .from(videoJob)
      .where(eq(videoJob.id, newId))
      .limit(1);

    return c.json({ job: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});
