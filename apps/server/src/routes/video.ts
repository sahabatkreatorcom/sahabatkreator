// API Video — job render video (batch templating + auto-caption via Modal)
//
// Alur: POST /video → validasi input media milik org → insert video_job
// (status queued) → enqueue sk_video_render → worker proses async.
// GET /video → list job + status (frontend polling).
//
// Fitur nonaktif (503 jelas) bila Modal belum dikonfigurasi — sama seperti
// graceful degradation REDIS_URL opsional. Lihat RFC §11.
import { db } from "@sahabatkreator/db";
import { DEFAULT_RENDER_SETTINGS, audioTrack, media, videoJob, videoJobClip } from "@sahabatkreator/db/schema";
import { enqueueVideoRender } from "@sahabatkreator/queue";
import { isRenderConfigured } from "@sahabatkreator/render";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const videoRoute = new Hono();

const gallerySchema = z.object({
  published: z.boolean(),
});

/** Default segmen montage (detik) — dipakai bila clip ada tapi setting kosong */
const DEFAULT_MONTAGE = { minSegmentSeconds: 2, maxSegmentSeconds: 5 } as const;

const createSchema = z.object({
  baseVideoMediaId: z.string().min(1, "Base video wajib dipilih"),
  // Clip montage tambahan (id media video). Kosong = mode single.
  clipMediaIds: z.array(z.string()).optional(),
  voiceoverMediaId: z.string().nullish(),
  bgmAudioTrackId: z.string().nullish(),
  // Publikasikan output ke galeri publik /renders? Default false — hasil
  // render adalah karya klien private, publikasi wajib persetujuan user.
  publishToGallery: z.boolean().default(false),
  settings: z
    .object({
      orientation: z.enum(["portrait", "landscape", "square"]).default("portrait"),
      resolution: z.enum(["720p", "1080p"]).default("1080p"),
      removeOriginalAudio: z.boolean().default(true),
      voiceVolume: z.number().min(0).max(1).default(1.0),
      bgmVolume: z.number().min(0).max(1).default(0.3),
      // Mode montage: segmen acak per clip. min <= max, keduanya > 0.
      montage: z
        .object({
          minSegmentSeconds: z.number().min(0.5).max(30).default(2),
          maxSegmentSeconds: z.number().min(0.5).max(60).default(5),
        })
        .refine((m) => m.minSegmentSeconds <= m.maxSegmentSeconds, {
          message: "minSegmentSeconds tidak boleh lebih besar dari maxSegmentSeconds",
        })
        .nullish(),
      caption: z
        .object({
          enabled: z.boolean().default(true),
          language: z.enum(["id", "en", "auto"]).default("id"),
          model: z.enum(["tiny", "base", "small", "medium"]).default("base"),
          fontSize: z.number().int().min(12).max(72).default(24),
          fontColor: z.string().default("white"),
          position: z.enum(["bottom", "top", "center"]).default("bottom"),
          wordHighlight: z.boolean().default(true),
        })
        .default(DEFAULT_RENDER_SETTINGS.caption),
      headline: z
        .object({
          text: z.string().max(120),
          fontSize: z.number().int().min(16).max(120).default(48),
          fontColor: z.string().default("white"),
          positionY: z.number().min(0).max(1).default(0.1),
        })
        .nullish(),
    })
    .default(DEFAULT_RENDER_SETTINGS),
});

/** GET /video — list job render org aktif (terbaru di atas) */
videoRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

    const jobs = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        progress: videoJob.progress,
        settings: videoJob.settings,
        errorCode: videoJob.errorCode,
        errorMessage: videoJob.errorMessage,
        publishedToGallery: videoJob.publishedToGallery,
        createdAt: videoJob.createdAt,
        updatedAt: videoJob.updatedAt,
        // Base video (untuk thumbnail/nama)
        baseVideoName: media.name,
        baseVideoUrl: media.url,
        baseVideoThumbnailUrl: media.thumbnailUrl,
        // Output (bila sudah done)
        outputMediaId: videoJob.outputMediaId,
      })
      .from(videoJob)
      .innerJoin(media, eq(media.id, videoJob.baseVideoMediaId))
      .where(eq(videoJob.organizationId, ctx.organization.id))
      .orderBy(desc(videoJob.createdAt))
      .limit(limit);

    return c.json({ jobs, renderEnabled: isRenderConfigured() });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /video — buat job render baru */
videoRoute.post("/", async (c) => {
  try {
    if (!isRenderConfigured()) {
      return c.json(
        {
          message:
            "Fitur render video belum dikonfigurasi. Set MODAL_TOKEN dan MODAL_RENDER_URL di server.",
        },
        503,
      );
    }

    const ctx = await requireOrg(c);
    const body = createSchema.parse(await c.req.json());

    // Validasi: base video harus milik org dan bertipe video
    const [baseVideo] = await db
      .select()
      .from(media)
      .where(
        and(
          eq(media.id, body.baseVideoMediaId),
          eq(media.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);

    if (!baseVideo) {
      return c.json({ message: "Base video tidak ditemukan" }, 404);
    }
    if (baseVideo.type !== "video") {
      return c.json({ message: "Media yang dipilih harus berupa video" }, 400);
    }

    // Validasi clip montage: milik org, bertipe video, dan tidak duplikat
    // (base video tidak boleh muncul lagi di clip list).
    const clipIds = [...new Set(body.clipMediaIds ?? [])].filter(
      (id) => id !== body.baseVideoMediaId,
    );
    let validClipIds: string[] = [];
    if (clipIds.length) {
      const clipRows = await db
        .select({ id: media.id })
        .from(media)
        .where(
          and(
            inArray(media.id, clipIds),
            eq(media.organizationId, ctx.organization.id),
            eq(media.type, "video"),
          ),
        );
      validClipIds = clipRows.map((r) => r.id);
      if (validClipIds.length !== clipIds.length) {
        return c.json(
          { message: "Satu atau beberapa clip montage tidak valid" },
          400,
        );
      }
    }

    // Validasi voiceover (opsional, harus audio milik org)
    if (body.voiceoverMediaId) {
      const [voice] = await db
        .select({ id: media.id, type: media.type })
        .from(media)
        .where(
          and(
            eq(media.id, body.voiceoverMediaId),
            eq(media.organizationId, ctx.organization.id),
          ),
        )
        .limit(1);
      if (!voice) return c.json({ message: "Voiceover tidak ditemukan" }, 404);
      if (voice.type !== "audio") {
        return c.json({ message: "Voiceover harus berupa file audio" }, 400);
      }
    }

    // Validasi BGM (opsional, dari audio_track library)
    if (body.bgmAudioTrackId) {
      const [bgm] = await db
        .select({ id: audioTrack.id })
        .from(audioTrack)
        .where(
          and(
            eq(audioTrack.id, body.bgmAudioTrackId),
            eq(audioTrack.organizationId, ctx.organization.id),
          ),
        )
        .limit(1);
      if (!bgm) return c.json({ message: "Background music tidak ditemukan" }, 404);
    }

    // Insert job + clip montage (bila ada). Montage aktif hanya bila ada clip —
    // settings.montage tanpa clip tidak ada efek (worker abaikan).
    const id = generateId("video_job");
    const hasClips = validClipIds.length > 0;
    await db.transaction(async (tx) => {
      await tx.insert(videoJob).values({
        id,
        organizationId: ctx.organization.id,
        baseVideoMediaId: body.baseVideoMediaId,
        voiceoverMediaId: body.voiceoverMediaId ?? null,
        bgmAudioTrackId: body.bgmAudioTrackId ?? null,
        settings: {
          ...body.settings,
          // Hilangkan konfigurasi montage bila tidak ada clip (jaga konsistensi).
          montage: hasClips ? body.settings.montage ?? DEFAULT_MONTAGE : undefined,
          headline: body.settings.headline ?? undefined,
        },
        publishedToGallery: body.publishToGallery,
        status: "queued",
        createdByUserId: ctx.user.id,
      });

      if (hasClips) {
        await tx.insert(videoJobClip).values(
          validClipIds.map((mediaId, order) => ({
            id: generateId("video_clip"),
            videoJobId: id,
            order,
            mediaId,
          })),
        );
      }
    });

    // Enqueue worker — null bila Redis tidak ada (fallback polling akan ambil)
    const enqueued = await enqueueVideoRender(id);
    if (!enqueued) {
      console.warn(`[video] Redis tidak ada — job ${id} menunggu fallback polling`);
    }

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

    return c.json({ job: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /video/:id — status satu job (frontend polling 2s) */
videoRoute.get("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [row] = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        progress: videoJob.progress,
        settings: videoJob.settings,
        errorCode: videoJob.errorCode,
        errorMessage: videoJob.errorMessage,
        outputMediaId: videoJob.outputMediaId,
        srtStorageKey: videoJob.srtStorageKey,
        createdAt: videoJob.createdAt,
        updatedAt: videoJob.updatedAt,
      })
      .from(videoJob)
      .where(and(eq(videoJob.id, id), eq(videoJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!row) return c.json({ message: "Job tidak ditemukan" }, 404);
    return c.json({ job: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /video/:id — batalkan job queued, atau hapus job terminal (failed/canceled) dari riwayat */
videoRoute.delete("/:id", async (c) => {
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
    if (row.status === "done") {
      return c.json({ message: "Job sudah selesai" }, 409);
    }

    if (row.status === "failed" || row.status === "canceled") {
      // Job terminal — hapus dari riwayat. Output (bila ada) tetap di media library.
      await db.delete(videoJob).where(eq(videoJob.id, id));
      return c.json({ ok: true });
    }

    // status queued → batalkan
    await db
      .update(videoJob)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(videoJob.id, id));

    // Hapus job BullMQ tertunda (no-op bila sudah diproses / Redis kosong)
    const { cancelVideoRenderJob } = await import("@sahabatkreator/queue");
    await cancelVideoRenderJob(id);

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /video/:id/retry — buat ulang job dari konfigurasi job gagal/dibatalkan */
videoRoute.post("/:id/retry", async (c) => {
  try {
    if (!isRenderConfigured()) {
      return c.json(
        {
          message:
            "Fitur render video belum dikonfigurasi. Set MODAL_TOKEN dan MODAL_RENDER_URL di server.",
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
    // Clip montage job lama disalin agar retry menghasilkan komposisi sama.
    const oldClips = await db
      .select({ mediaId: videoJobClip.mediaId, order: videoJobClip.order })
      .from(videoJobClip)
      .where(eq(videoJobClip.videoJobId, id))
      .orderBy(asc(videoJobClip.order));

    await db.transaction(async (tx) => {
      await tx.insert(videoJob).values({
        id: newId,
        organizationId: job.organizationId,
        baseVideoMediaId: job.baseVideoMediaId,
        voiceoverMediaId: job.voiceoverMediaId,
        bgmAudioTrackId: job.bgmAudioTrackId,
        settings: job.settings,
        // Preserve preferensi publikasi job asli
        publishedToGallery: job.publishedToGallery,
        status: "queued",
        createdByUserId: ctx.user.id,
      });

      if (oldClips.length) {
        await tx.insert(videoJobClip).values(
          oldClips.map((clip) => ({
            id: generateId("video_clip"),
            videoJobId: newId,
            order: clip.order,
            mediaId: clip.mediaId,
          })),
        );
      }
    });

    const enqueued = await enqueueVideoRender(newId);
    if (!enqueued) {
      console.warn(`[video] Redis tidak ada — job ${newId} menunggu fallback polling`);
    }

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

/**
 * PATCH /video/:id/gallery — toggle publikasi job done ke galeri publik
 * (/renders). Publikasi default OFF; user harus opt-in explicitly.
 */
videoRoute.patch("/:id/gallery", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");
    const { published } = gallerySchema.parse(await c.req.json());

    const [job] = await db
      .select({
        id: videoJob.id,
        status: videoJob.status,
        settings: videoJob.settings,
        outputMediaId: videoJob.outputMediaId,
        createdAt: videoJob.createdAt,
      })
      .from(videoJob)
      .where(and(eq(videoJob.id, id), eq(videoJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!job) return c.json({ message: "Job tidak ditemukan" }, 404);
    if (job.status !== "done") {
      return c.json({ message: "Hanya job yang sudah selesai yang bisa dipublikasi" }, 409);
    }

    await db
      .update(videoJob)
      .set({ publishedToGallery: published, updatedAt: new Date() })
      .where(eq(videoJob.id, id));

    // Sinkron manifest: tambah bila publish, hapus bila unpublish.
    const { publishRenderManifest, unpublishRenderManifest } = await import(
      "@sahabatkreator/queue"
    );
    if (published) {
      const [output] = job.outputMediaId
        ? await db
            .select({
              url: media.url,
              sizeBytes: media.sizeBytes,
              width: media.width,
              height: media.height,
              durationSeconds: media.durationSeconds,
            })
            .from(media)
            .where(eq(media.id, job.outputMediaId))
            .limit(1)
        : [];
      if (output) {
        await publishRenderManifest({
          id: job.id,
          organizationId: ctx.organization.id,
          title: `render-${job.createdAt.getFullYear()}`,
          orientation: job.settings.orientation,
          videoUrl: output.url,
          sizeBytes: output.sizeBytes ?? 0,
          durationSeconds: output.durationSeconds ?? 0,
          width: output.width ?? 0,
          height: output.height ?? 0,
          renderedAt: job.createdAt.toISOString(),
        }).catch((err) => console.warn("[video] gagal publish manifest:", err));
      }
    } else {
      await unpublishRenderManifest(job.id).catch((err) =>
        console.warn("[video] gagal unpublish manifest:", err),
      );
    }

    return c.json({ ok: true, published });
  } catch (error) {
    return errorResponse(error);
  }
});
