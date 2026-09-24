// API Carousel — job render slide gambar via Modal (Pillow). RFC docs/rfc-carousel-render.md.
//
// Alur: POST /carousel → (opsional generate outline via /ai/carousel) → insert
// carousel_job + carousel_job_slide (status queued) → enqueue sk_carousel_render
// → worker source background (stock) + render + daftar slide ke media library.
// GET /carousel/:id → polling status + slide hasil (frontend polling 2s).
//
// Fitur nonaktif (503 jelas) bila Modal carousel belum dikonfigurasi — sama
// seperti graceful degradation pada video render.
import { db } from "@sahabatkreator/db";
import {
  type CarouselSettings,
  carouselJob,
  carouselJobSlide,
  media,
} from "@sahabatkreator/db/schema";
import { enqueueCarouselRender } from "@sahabatkreator/queue";
import { isCarouselConfigured } from "@sahabatkreator/render";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fireActivity } from "../lib/activity-log";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const carouselRoute = new Hono();

/**
 * Default settings — 4:5 feed (BUKAN 9:16 yang ter-crop di feed IG), style box.
 *
 * Tidak dianotasi `CarouselSettings` supaya tipe infer literal cocok dengan
 * input shape settingsSchema di bawah (zod `.default()` butuh full shape,
 * field optional di CarouselSettings akan mismatch). Lihat catatan zod v4
 * di MEMORY.md: default harus full shape eksplisit.
 */
const DEFAULT_SETTINGS = {
  style: "box",
  format: "portrait4_5",
  slideCount: 6,
  boxOpacity: 235,
  titleFontFamily: "Fredoka",
  contentFontFamily: "Fredoka",
  backgroundMode: "solid",
  backgroundQuery: "",
  aiLayout: { enabled: false },
} satisfies CarouselSettings;

const settingsSchema = z
  .object({
    style: z.enum(["outline", "box", "box_title_content", "plain"]).default(DEFAULT_SETTINGS.style),
    format: z.enum(["portrait", "portrait4_5", "square"]).default(DEFAULT_SETTINGS.format),
    slideCount: z.number().int().min(3).max(10).default(DEFAULT_SETTINGS.slideCount),
    boxOpacity: z.number().int().min(0).max(255).default(DEFAULT_SETTINGS.boxOpacity),
    titleFontFamily: z.string().min(1).default(DEFAULT_SETTINGS.titleFontFamily),
    contentFontFamily: z.string().min(1).default(DEFAULT_SETTINGS.contentFontFamily),
    backgroundMode: z.enum(["library", "stock", "solid"]).default(DEFAULT_SETTINGS.backgroundMode),
    backgroundQuery: z.string().max(200).default(DEFAULT_SETTINGS.backgroundQuery),
    /**
     * AI Visual Layout Director (fase 2, RFC §7) — toggle opt-in.
     * Vision model deteksi wajah/objek background, tempatkan teks di negative
     * space. Berbiaya (1 call multimodal per carousel) → default false.
     * Model diisi worker dari platformSettings (admin), user tidak pilih model.
     */
    aiLayout: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  })
  .default(DEFAULT_SETTINGS);

const slideSchema = z.object({
  title: z.string().min(1, "Judul slide wajib").max(80),
  body: z.string().max(600).optional(),
  /** media background dari library (mode library) — harus milik org */
  backgroundMediaId: z.string().nullish(),
});

const createSchema = z.object({
  topic: z.string().min(3, "Topik wajib").max(300),
  /** Slide manual; kosong = generate outline via /ai/carousel di worker route ini */
  slides: z
    .array(slideSchema)
    .min(1, "Minimal 1 slide")
    .max(11, "Maksimal 11 slide (cover + 10)")
    .optional(),
  /** Caption final carousel (dari /ai/carousel); stock credit ditambahkan worker */
  caption: z.string().max(3000).optional(),
  settings: settingsSchema,
});

/** GET /carousel — list job carousel org aktif (terbaru di atas) */
carouselRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

    const jobs = await db
      .select({
        id: carouselJob.id,
        topic: carouselJob.topic,
        status: carouselJob.status,
        progress: carouselJob.progress,
        settings: carouselJob.settings,
        caption: carouselJob.caption,
        errorCode: carouselJob.errorCode,
        errorMessage: carouselJob.errorMessage,
        targetPlatform: carouselJob.targetPlatform,
        createdAt: carouselJob.createdAt,
        updatedAt: carouselJob.updatedAt,
      })
      .from(carouselJob)
      .where(eq(carouselJob.organizationId, ctx.organization.id))
      .orderBy(desc(carouselJob.createdAt))
      .limit(limit);

    return c.json({ jobs, carouselEnabled: isCarouselConfigured() });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /carousel — buat job render carousel baru */
carouselRoute.post("/", async (c) => {
  try {
    if (!isCarouselConfigured()) {
      return c.json(
        {
          message:
            "Fitur carousel belum dikonfigurasi. Set MODAL_TOKEN dan MODAL_CAROUSEL_URL di server.",
        },
        503,
      );
    }

    const ctx = await requireOrg(c);
    const body = createSchema.parse(await c.req.json());
    const settings = body.settings;

    // Mode stock butuh keyword + PIXABAY_KEY (cek awal, gagal cepat sebelum insert)
    if (settings.backgroundMode === "stock" && !settings.backgroundQuery.trim()) {
      return c.json({ message: "Mode background stock butuh kata kunci pencarian" }, 400);
    }

    // --- resolve slide: manual atau generate via /ai/carousel ---
    let slides: { title: string; body?: string; backgroundMediaId?: string | null }[];
    let caption = body.caption ?? "";

    if (body.slides?.length) {
      slides = body.slides;
    } else {
      // Generate outline — reuse route /ai/carousel (sudah ada brand voice +
      // quota AI). Import dinamis: route file ini berada di luar aiRoute scope.
      const generated = await generateOutlineViaAi({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        topic: body.topic,
        slideCount: settings.slideCount,
      });
      slides = generated.slides;
      if (!caption) caption = generated.caption;
    }

    // Validasi background library: milik org + tipe image
    const bgIds = slides.map((s) => s.backgroundMediaId).filter((id): id is string => !!id);
    let validBgIds = new Set<string>();
    if (bgIds.length) {
      const bgRows = await db
        .select({ id: media.id })
        .from(media)
        .where(
          and(
            inArray(media.id, bgIds),
            eq(media.organizationId, ctx.organization.id),
            eq(media.type, "image"),
          ),
        );
      validBgIds = new Set(bgRows.map((r) => r.id));
      if (validBgIds.size !== bgIds.length) {
        return c.json(
          { message: "Satu atau beberapa background tidak valid (harus gambar milik org ini)" },
          400,
        );
      }
    }

    // --- insert job + slide (transactional) ---
    const id = generateId("carousel_job");
    await db.transaction(async (tx) => {
      await tx.insert(carouselJob).values({
        id,
        organizationId: ctx.organization.id,
        createdByUserId: ctx.user.id,
        topic: body.topic,
        caption: caption || null,
        settings,
        targetPlatform: "instagram", // fase 1: IG saja (RFC §8)
        status: "queued",
      });

      await tx.insert(carouselJobSlide).values(
        slides.map((s, urutan) => ({
          id: generateId("carousel_slide"),
          carouselJobId: id,
          urutan,
          title: s.title,
          body: s.body ?? null,
          // Mode stock: null dulu, worker yang source (status 'sourcing').
          // Mode solid: null selamanya (gradient default).
          backgroundMediaId:
            settings.backgroundMode === "library" &&
            s.backgroundMediaId &&
            validBgIds.has(s.backgroundMediaId)
              ? s.backgroundMediaId
              : null,
        })),
      );
    });

    // Enqueue worker — null bila Redis tidak ada (fallback polling akan ambil)
    const enqueued = await enqueueCarouselRender(id);
    if (!enqueued) {
      console.warn(`[carousel] Redis tidak ada — job ${id} menunggu fallback polling`);
    }

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "carousel.created",
      targetType: "carousel_job",
      targetId: id,
    });

    return c.json({ jobId: id, status: "queued", slideCount: slides.length }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /carousel/:id — status job + slide hasil (frontend polling 2s) */
carouselRoute.get("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [job] = await db
      .select({
        id: carouselJob.id,
        topic: carouselJob.topic,
        status: carouselJob.status,
        progress: carouselJob.progress,
        settings: carouselJob.settings,
        caption: carouselJob.caption,
        errorCode: carouselJob.errorCode,
        errorMessage: carouselJob.errorMessage,
        createdAt: carouselJob.createdAt,
        updatedAt: carouselJob.updatedAt,
      })
      .from(carouselJob)
      .where(and(eq(carouselJob.id, id), eq(carouselJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!job) return c.json({ message: "Job tidak ditemukan" }, 404);

    // Slide + URL output (join media untuk dapat url hasil render)
    const slideRows = await db
      .select({
        urutan: carouselJobSlide.urutan,
        title: carouselJobSlide.title,
        body: carouselJobSlide.body,
        stockCredit: carouselJobSlide.stockCredit,
        layout: carouselJobSlide.layout,
        outputUrl: media.url,
        outputWidth: media.width,
        outputHeight: media.height,
        outputSizeBytes: media.sizeBytes,
      })
      .from(carouselJobSlide)
      .leftJoin(media, eq(media.id, carouselJobSlide.outputMediaId))
      .where(eq(carouselJobSlide.carouselJobId, id))
      .orderBy(asc(carouselJobSlide.urutan));

    return c.json({
      job,
      slides: slideRows.map((s) => ({
        urutan: s.urutan,
        title: s.title,
        body: s.body,
        stockCredit: s.stockCredit,
        layout: s.layout,
        url: s.outputUrl,
        width: s.outputWidth,
        height: s.outputHeight,
        sizeBytes: s.outputSizeBytes,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /carousel/:id — batalkan job queued, atau hapus job terminal dari riwayat */
carouselRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [row] = await db
      .select({ id: carouselJob.id, status: carouselJob.status })
      .from(carouselJob)
      .where(and(eq(carouselJob.id, id), eq(carouselJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!row) return c.json({ message: "Job tidak ditemukan" }, 404);
    if (row.status === "rendering" || row.status === "uploading" || row.status === "sourcing") {
      return c.json({ message: "Job sedang diproses, tidak bisa dibatalkan" }, 409);
    }
    if (row.status === "done") {
      return c.json({ message: "Job sudah selesai" }, 409);
    }

    if (row.status === "failed" || row.status === "canceled") {
      // Job terminal — hapus dari riwayat. Slide output tetap di media library.
      await db.delete(carouselJob).where(eq(carouselJob.id, id));
      fireActivity({
        orgId: ctx.organization.id,
        userId: ctx.user.id,
        action: "carousel.deleted",
        targetType: "carousel_job",
        targetId: id,
      });
      return c.json({ ok: true });
    }

    // status queued → batalkan
    await db
      .update(carouselJob)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(carouselJob.id, id));

    // Hapus job BullMQ tertunda (no-op bila sudah diproses / Redis kosong)
    const { cancelCarouselRenderJob } = await import("@sahabatkreator/queue");
    await cancelCarouselRenderJob(id);

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "carousel.canceled",
      targetType: "carousel_job",
      targetId: id,
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /carousel/:id/retry — retry job failed (reset ke queued + enqueue ulang) */
carouselRoute.post("/:id/retry", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const id = c.req.param("id");

    const [row] = await db
      .select({ id: carouselJob.id, status: carouselJob.status })
      .from(carouselJob)
      .where(and(eq(carouselJob.id, id), eq(carouselJob.organizationId, ctx.organization.id)))
      .limit(1);

    if (!row) return c.json({ message: "Job tidak ditemukan" }, 404);
    if (row.status !== "failed") {
      return c.json({ message: "Hanya job failed yang bisa di-retry" }, 409);
    }

    await db
      .update(carouselJob)
      .set({
        status: "queued",
        progress: 0,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(carouselJob.id, id));

    await enqueueCarouselRender(id);

    fireActivity({
      orgId: ctx.organization.id,
      userId: ctx.user.id,
      action: "carousel.retried",
      targetType: "carousel_job",
      targetId: id,
    });

    return c.json({ ok: true, status: "queued" });
  } catch (error) {
    return errorResponse(error);
  }
});

// ============================================================
// Generate outline via /ai/carousel — dipakai saat client tidak kirim slide
// manual. Logika AI + quota sudah ada di route itu; di sini cuma memanggil
// ulang fungsi intinya agar tidak duplikasi prompt.
// ============================================================
async function generateOutlineViaAi(opts: {
  orgId: string;
  userId: string;
  topic: string;
  slideCount: number;
}): Promise<{ slides: { title: string; body: string }[]; caption: string }> {
  // Panggil internal route AI lewat modul yang sama — generateCarouselOutline
  // di-export dari routes/ai untuk dipakai sini (hindari copy prompt).
  const { generateCarouselOutline } = await import("./ai");
  const result = await generateCarouselOutline({
    orgId: opts.orgId,
    userId: opts.userId,
    topic: opts.topic,
    slideCount: opts.slideCount,
    style: "edukasi",
    platform: "instagram",
  });
  return result;
}
