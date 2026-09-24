// Carousel processor — inti worker: claim job, source background (stock),
// presign R2, panggil adapter Modal (Pillow), simpan slide ke media library.
//
// Tiga fase status (sama seperti antrian pada umumnya, tapi carousel punya
// langkah sourcing tambahan sebelum render):
//   queued → sourcing → rendering → uploading → done
//
// Claim atomik: UPDATE carousel_job SET status='sourcing' WHERE id=? AND
// status='queued' RETURNING — pola yang sama dengan render-processor dan
// claimPostById. Mencegah double-processing saat dua runner aktif.

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@sahabatkreator/db";
import {
  type CarouselSettings,
  carouselJob,
  carouselJobSlide,
  media,
} from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  CarouselRenderError,
  type CarouselRenderSlide,
  getCarouselAdapter,
  getRenderAdapter,
} from "@sahabatkreator/render";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { computeSlideLayouts, type SlideLayout } from "./layout-director";
import { getStockSource } from "./stock";

const PRESIGN_EXPIRES = 3600; // 1 jam — carousel render hanya butuh beberapa menit

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET
    ) {
      throw new Error("R2 belum dikonfigurasi — carousel butuh storage untuk input/output");
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
 * Claim satu carousel job secara atomik (queued → sourcing).
 * Return null bila sudah diclaim runner lain / status bukan queued.
 */
async function claimJob(id: string): Promise<{ id: string } | null> {
  const [row] = await db
    .update(carouselJob)
    .set({ status: "sourcing", progress: 0, updatedAt: new Date() })
    .where(
      and(
        eq(carouselJob.id, id),
        // Accept "queued" (normal) atau "sourcing" (retry dari attempt sebelumnya)
        or(eq(carouselJob.status, "queued"), eq(carouselJob.status, "sourcing")),
      ),
    )
    .returning({ id: carouselJob.id });
  return row ?? null;
}

/** Orientasi fisik dari format — dipakai stock search & cover-fit */
function orientationFor(format: CarouselSettings["format"]): "portrait" | "square" {
  return format === "square" ? "square" : "portrait";
}

/** Warna gradient default per format (fallback ketika solid tanpa warna) */
const DEFAULT_GRADIENTS: Record<CarouselSettings["format"], [string, string]> = {
  portrait: ["#6B21A8", "#1E1E53"],
  portrait4_5: ["#6B21A8", "#1E1E53"],
  square: ["#581C87", "#0F172A"],
};

/**
 * Source background untuk slide yang belum punya backgroundMediaId (mode stock).
 * Slide library sudah di-resolve di route (backgroundMediaId terisi + tervalidasi
 * ownership); slide solid tidak butuh media.
 */
async function sourceStockBackgrounds(
  organizationId: string,
  settings: CarouselSettings,
  slides: { id: string; urutan: number }[],
): Promise<void> {
  if (settings.backgroundMode !== "stock") return;
  if (!slides.length) return;

  const source = getStockSource();
  if (!source) {
    throw new CarouselRenderError(
      "Mode background stock dipilih tapi PIXABAY_KEY belum dikonfigurasi",
      "stock_not_configured",
      false, // permanen: jangan retry, config tidak berubah
    );
  }

  const orientation = orientationFor(settings.format);
  const results = await source.search(settings.backgroundQuery, {
    orientation,
    perPage: Math.max(slides.length, 3),
  });
  if (!results.length) {
    throw new CarouselRenderError(
      `Tidak ada stock image untuk kata kunci "${settings.backgroundQuery}"`,
      "stock_no_results",
      false,
    );
  }

  // Source tiap slide (dedup otomatis di adapter — background sama tidak
  // di-download ulang). Gagal satu → throw, seluruh job gagal (atomic).
  for (const [i, slide] of slides.entries()) {
    const result = results[i % results.length];
    if (!result) continue;
    const sourced = await source.source(result, { organizationId, orientation });
    await db
      .update(carouselJobSlide)
      .set({ backgroundMediaId: sourced.mediaId, stockCredit: sourced.credit })
      .where(eq(carouselJobSlide.id, slide.id));
  }
}

/** Proses satu carousel job (dipanggil BullMQ worker). */
export async function processCarouselRenderJob(
  carouselJobId: string,
  onProgress?: (percent: number) => void,
): Promise<{ ok: boolean }> {
  const adapter = getCarouselAdapter();
  if (!adapter) {
    await markCarouselFailed(
      carouselJobId,
      "carousel_not_configured",
      "MODAL_TOKEN/MODAL_CAROUSEL_URL belum dikonfigurasi di worker",
    );
    return { ok: false };
  }

  const claimed = await claimJob(carouselJobId);
  if (!claimed) return { ok: false }; // sudah diclaim / bukan queued

  try {
    const [job] = await db
      .select()
      .from(carouselJob)
      .where(eq(carouselJob.id, carouselJobId))
      .limit(1);
    if (!job) throw new CarouselRenderError("carousel_job tidak ditemukan", "job_not_found", false);
    const settings = job.settings as CarouselSettings;

    // storageKey output per slide — LOCAL per job run. (Map module-level akan
    // race antar job concurrent di proses yang sama.)
    const outputKeys = new Map<string, string>();

    // --- muat slide (urutan ascending) ---
    const slideRows = await db
      .select()
      .from(carouselJobSlide)
      .where(eq(carouselJobSlide.carouselJobId, carouselJobId))
      .orderBy(asc(carouselJobSlide.urutan));
    if (!slideRows.length) {
      throw new CarouselRenderError("Job tidak punya slide", "no_slides", false);
    }

    // --- fase sourcing: resolve background stock untuk slide yang perlu ---
    const needStock = slideRows.filter((s) => !s.backgroundMediaId);
    if (settings.backgroundMode === "stock" && needStock.length) {
      await sourceStockBackgrounds(
        job.organizationId,
        settings,
        needStock.map((s) => ({ id: s.id, urutan: s.urutan })),
      );
    }

    // --- masuk fase rendering ---
    await db
      .update(carouselJob)
      .set({ status: "rendering", progress: 15, updatedAt: new Date() })
      .where(eq(carouselJob.id, carouselJobId));
    onProgress?.(15);

    // --- muat background media (storageKey) ---
    const bgIds = slideRows.map((s) => s.backgroundMediaId).filter((id): id is string => !!id);
    const bgRows = bgIds.length
      ? await db
          .select({ id: media.id, storageKey: media.storageKey })
          .from(media)
          .where(and(inArray(media.id, bgIds), eq(media.type, "image")))
      : [];
    const bgByKey = new Map(bgRows.map((r) => [r.id, r.storageKey]));

    // --- AI Visual Layout Director (fase 2, RFC §7) ---
    // Hanya untuk slide dengan background gambar — solid gradient tidak perlu
    // deteksi negative space (komposisinya sudah deterministic). Opt-in via
    // settings.aiLayout.enabled; gagal/timeout → fallback template center.
    const layouts = new Map<number, SlideLayout>();
    const aiLayoutOn = Boolean(settings.aiLayout?.enabled);
    if (aiLayoutOn) {
      const slideBgKeys = slideRows
        .filter((s) => s.backgroundMediaId && bgByKey.has(s.backgroundMediaId))
        .map((s) => ({
          urutan: s.urutan,
          storageKey: bgByKey.get(s.backgroundMediaId as string) as string,
        }));
      const computed = await computeSlideLayouts({
        slides: slideBgKeys,
        style: settings.style,
        format: settings.format,
        organizationId: job.organizationId,
      });
      if (computed) {
        for (const l of computed) layouts.set(l.urutan, l);
        // persist layout ke slide row (audit + reuse)
        await Promise.all(
          computed.map((l) =>
            db
              .update(carouselJobSlide)
              .set({ layout: l })
              .where(
                and(
                  eq(carouselJobSlide.carouselJobId, carouselJobId),
                  eq(carouselJobSlide.urutan, l.urutan),
                ),
              ),
          ),
        );
      }
    }

    // --- presigned URL per slide ---
    const datePrefix = `${job.organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const renderSlides: CarouselRenderSlide[] = [];
    for (const slide of slideRows) {
      const storageKey = slide.backgroundMediaId ? bgByKey.get(slide.backgroundMediaId) : null;
      const outKey = `${datePrefix}/carousel_${carouselJobId}_slide_${slide.urutan}.jpg`;

      renderSlides.push({
        urutan: slide.urutan,
        title: slide.title,
        body: slide.body ?? "",
        background: storageKey
          ? { mode: "image", url: await presignGet(storageKey) }
          : {
              mode: "solid",
              topColor: DEFAULT_GRADIENTS[settings.format][0],
              bottomColor: DEFAULT_GRADIENTS[settings.format][1],
            },
        uploadUrl: await presignPut(outKey, "image/jpeg"),
        // Layout director: null untuk solid background (tidak perlu deteksi
        // negative space). Renderer Modal fallback ke template center.
        layout: storageKey ? (layouts.get(slide.urutan) ?? null) : null,
      });
      // simpan storageKey output untuk insert media nanti (local — aman secara
      // concurrency: map ini per job run, tidak dibagi antar worker coroutine)
      outputKeys.set(slide.id, outKey);
    }

    // --- panggil adapter (Modal Pillow) ---
    const result = await adapter.render(
      {
        jobId: carouselJobId,
        format: settings.format,
        style: settings.style,
        boxOpacity: settings.boxOpacity,
        titleFontFamily: settings.titleFontFamily,
        contentFontFamily: settings.contentFontFamily,
        slides: renderSlides,
      },
      (percent) => {
        onProgress?.(percent);
        db.update(carouselJob)
          .set({ progress: Math.round(percent), updatedAt: new Date() })
          .where(eq(carouselJob.id, carouselJobId))
          .execute()
          .catch(() => undefined);
      },
    );

    // --- fase uploading: daftarkan tiap slide ke media library ---
    await db
      .update(carouselJob)
      .set({ status: "uploading", progress: 90, updatedAt: new Date() })
      .where(eq(carouselJob.id, carouselJobId));
    onProgress?.(90);

    const renderedById = new Map(result.slides.map((s) => [s.urutan, s]));
    const captionCredits: string[] = [];

    for (const slide of slideRows) {
      const rendered = renderedById.get(slide.urutan);
      const outKey = outputKeys.get(slide.id);
      if (!rendered || !outKey) continue;

      const mediaId = `sk_media_${crypto.randomUUID().replace(/-/g, "")}`;
      const publicUrl = `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${outKey}`;
      await db.insert(media).values({
        id: mediaId,
        organizationId: job.organizationId,
        name: `carousel-${job.topic.slice(0, 30)}-slide-${slide.urutan}.jpg`,
        type: "image",
        storageKey: outKey,
        url: publicUrl,
        mimeType: "image/jpeg",
        sizeBytes: rendered.sizeBytes,
        width: rendered.width,
        height: rendered.height,
        // Slide adalah JPEG → thumbnail = dirinya sendiri (aturan: media render
        // selalu punya poster; di sini tidak ada video preload yang perlu cover).
        thumbnailUrl: publicUrl,
        uploadedByUserId: job.createdByUserId ?? null,
      });

      await db
        .update(carouselJobSlide)
        .set({ outputMediaId: mediaId })
        .where(eq(carouselJobSlide.id, slide.id));

      if (slide.stockCredit) captionCredits.push(slide.stockCredit);
    }

    // --- selesai ---
    // RFC §6: attribution stock mengalir ke CAPTION, bukan dibakar di slide —
    // desain slide tetap bersih, sekaligus penuhi syarat attribution provider.
    const finalCaption =
      captionCredits.length && job.caption
        ? `${job.caption}\n\n${[...new Set(captionCredits)].join("\n")}`
        : job.caption;
    await db
      .update(carouselJob)
      .set({
        status: "done",
        progress: 100,
        caption: finalCaption,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(carouselJob.id, carouselJobId));

    // --- export multi-platform (RFC §8 fase 3) ---
    // TikTok/YouTube API hanya terima video → carousel = MP4 slideshow.
    // Slide JPEG sudah ada di media library; susun jadi 1 MP4 + thumbnail.
    // Gagal export TIDAK membatalkan job carousel — slide tetap bisa dipakai
    // manual ( defensive: nilai utama sudah tercapai).
    const target = job.targetPlatform;
    if (target === "tiktok" || target === "youtube") {
      try {
        await exportSlideshow(carouselJobId, job.organizationId);
      } catch (error) {
        console.error(
          `[carousel] slideshow export gagal (job ${carouselJobId}) — slide tetap tersedia:`,
          error,
        );
      }
    }
    if (target === "linkedin" || target === "linkedin_org") {
      try {
        const pdfMediaId = await exportCarouselPdf(carouselJobId, job.organizationId);
        if (pdfMediaId) {
          console.log(`[carousel] PDF export done (media ${pdfMediaId})`);
        }
      } catch (error) {
        console.error(
          `[carousel] PDF export gagal (job ${carouselJobId}) — slide tetap tersedia:`,
          error,
        );
      }
    }

    return { ok: true };
  } catch (error) {
    const renderErr =
      error instanceof CarouselRenderError
        ? error
        : new CarouselRenderError(
            error instanceof Error ? error.message : String(error),
            "carousel_unknown",
            true,
          );
    // throw retryable agar BullMQ retry; permanen → mark failed sekarang.
    if (renderErr.retryable) throw error;
    await markCarouselFailed(carouselJobId, renderErr.code, renderErr.message);
    return { ok: false };
  }
}

/**
 * Export MP4 slideshow untuk TikTok/YouTube (RFC §8 fase 3).
 *
 * API TikTok/YouTube hanya menerima video, jadi carousel → MP4: tiap slide
 * tampil beberapa detik dengan transisi fade. Input-nya slide JPEG yang SUDAH
 * di-render dan tersimpan di media library — tidak render ulang.
 *
 * Gagal di sini tidak membatalkan carousel job (dipanggil dalam try/catch
 * caller): slide JPEG tetap bisa dipakai manual di compose.
 */
async function exportSlideshow(carouselJobId: string, organizationId: string): Promise<void> {
  const adapter = getRenderAdapter();
  if (!adapter) {
    console.warn("[carousel] slideshow export skip — render adapter belum dikonfigurasi");
    return;
  }

  // Ambil storageKey output slide (sudah di-insert media library di fase uploading)
  const slides = await db
    .select({
      id: carouselJobSlide.id,
      urutan: carouselJobSlide.urutan,
      storageKey: media.storageKey,
    })
    .from(carouselJobSlide)
    .leftJoin(media, eq(media.id, carouselJobSlide.outputMediaId))
    .where(eq(carouselJobSlide.carouselJobId, carouselJobId))
    .orderBy(asc(carouselJobSlide.urutan));

  const valid = slides.filter((s) => !!s.storageKey);
  if (valid.length < 1) return;

  // Presign download slide + upload MP4/thumbnail (pola yang sama dengan render)
  const outKey = `${organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/carousel_${carouselJobId}_slideshow.mp4`;
  const thumbKey = outKey.replace(/\.mp4$/, "_thumb.jpg");

  const result = await adapter.slideshow(
    {
      jobId: carouselJobId,
      slideUrls: await Promise.all(valid.map((s) => presignGet(s.storageKey as string))),
      // 3 detik per slide — cukup baca; total 6 slide = 15 detik (feed TT/YT pendek)
      slideDuration: 3.0,
      bgmUrl: null, // BGM slideshow = fase lanjut (perpustakaan audio dulu)
      outputUploadUrl: await presignPut(outKey, "video/mp4"),
      thumbnailUploadUrl: await presignPut(thumbKey, "image/jpeg"),
    },
    undefined,
  );

  // Daftarkan MP4 ke media library — user bisa langsung attach di compose
  // TikTok/YouTube. thumbnail = frame pertama (aturan media render).
  const mediaId = `sk_media_${crypto.randomUUID().replace(/-/g, "")}`;
  const publicUrl = `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${outKey}`;
  const thumbUrl = `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${thumbKey}`;
  await db.insert(media).values({
    id: mediaId,
    organizationId,
    name: `carousel-slideshow-${carouselJobId.slice(-12)}.mp4`,
    type: "video",
    storageKey: outKey,
    url: publicUrl,
    mimeType: "video/mp4",
    sizeBytes: result.sizeBytes,
    width: result.width,
    height: result.height,
    durationSeconds: result.durationSeconds,
    thumbnailUrl: thumbUrl,
  });

  console.log(
    `[carousel] slideshow export done: ${result.slideCount} slide → ${result.durationSeconds}s MP4 (media ${mediaId})`,
  );
}

/**
 * Export PDF tunggal untuk LinkedIn document post (RFC §8 fase 3).
 *
 * LinkedIn carousel itu PDF, bukan array gambar. Dipanggil worker ketika
 * targetPlatform=linkedin: render sekali lagi dengan exportFormat=pdf, hasil
 * 1 file PDF (tiap halaman = 1 slide). Disimpan ke media library sebagai
 * attachment bertipe application/pdf.
 */
export async function exportCarouselPdf(
  carouselJobId: string,
  organizationId: string,
): Promise<string | null> {
  const adapter = getCarouselAdapter();
  if (!adapter) return null;

  const [job] = await db
    .select()
    .from(carouselJob)
    .where(eq(carouselJob.id, carouselJobId))
    .limit(1);
  if (!job) return null;
  const settings = job.settings as CarouselSettings;

  const slideRows = await db
    .select()
    .from(carouselJobSlide)
    .where(eq(carouselJobSlide.carouselJobId, carouselJobId))
    .orderBy(asc(carouselJobSlide.urutan));
  if (!slideRows.length) return null;

  // Background storage keys (sama resolve seperti render utama)
  const bgIds = slideRows.map((s) => s.backgroundMediaId).filter((id): id is string => !!id);
  const bgRows = bgIds.length
    ? await db
        .select({ id: media.id, storageKey: media.storageKey })
        .from(media)
        .where(and(inArray(media.id, bgIds), eq(media.type, "image")))
    : [];
  const bgByKey = new Map(bgRows.map((r) => [r.id, r.storageKey]));

  const datePrefix = `${organizationId}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const pdfKey = `${datePrefix}/carousel_${carouselJobId}.pdf`;

  const renderSlides: CarouselRenderSlide[] = [];
  for (const slide of slideRows) {
    const storageKey = slide.backgroundMediaId
      ? (bgByKey.get(slide.backgroundMediaId) ?? null)
      : null;
    renderSlides.push({
      urutan: slide.urutan,
      title: slide.title,
      body: slide.body ?? "",
      background: storageKey
        ? { mode: "image", url: await presignGet(storageKey) }
        : {
            mode: "solid",
            topColor: DEFAULT_GRADIENTS[settings.format][0],
            bottomColor: DEFAULT_GRADIENTS[settings.format][1],
          },
      // uploadUrl pertama = target PDF tunggal (kontrak renderer fase 3)
      uploadUrl: slide.urutan === 0 ? await presignPut(pdfKey, "application/pdf") : "",
      layout: storageKey ? ((slide.layout as SlideLayout | null) ?? null) : null,
    });
  }

  const result = await adapter.renderPdf({
    jobId: carouselJobId,
    format: settings.format,
    style: settings.style,
    boxOpacity: settings.boxOpacity,
    titleFontFamily: settings.titleFontFamily,
    contentFontFamily: settings.contentFontFamily,
    slides: renderSlides,
  });

  // Daftarkan PDF ke media library (lineage carousel → dokumen LinkedIn)
  const mediaId = `sk_media_${crypto.randomUUID().replace(/-/g, "")}`;
  await db.insert(media).values({
    id: mediaId,
    organizationId,
    name: `carousel-${job.topic.slice(0, 30)}.pdf`,
    type: "image", // PDF disimpan sebagai attachment dokumen; type image paling dekat
    storageKey: pdfKey,
    url: `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${pdfKey}`,
    mimeType: "application/pdf",
    sizeBytes: result.pdf?.sizeBytes ?? 0,
    width: result.pdf?.width ?? result.slides[0]?.width ?? null,
    height: result.pdf?.height ?? result.slides[0]?.height ?? null,
    source: `carousel:${carouselJobId}`,
    uploadedByUserId: job.createdByUserId ?? null,
  });

  return mediaId;
}

/** Tandai carousel job failed permanen */
export async function markCarouselFailed(
  carouselJobId: string,
  code: string,
  message: string,
): Promise<void> {
  await db
    .update(carouselJob)
    .set({ status: "failed", errorCode: code, errorMessage: message, updatedAt: new Date() })
    .where(and(eq(carouselJob.id, carouselJobId), sql`status NOT IN ('done')`));
}

/** Fallback polling: claim semua job queued, proses berurutan (Redis kosong) */
export async function processCarouselDueJobs(): Promise<{
  claimed: number;
  done: number;
  failed: number;
}> {
  const rows = await db
    .select({ id: carouselJob.id })
    .from(carouselJob)
    .where(eq(carouselJob.status, "queued"))
    .limit(5);

  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await processCarouselRenderJob(row.id);
      if (result.ok) done++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { claimed: rows.length, done, failed };
}
