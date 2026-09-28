// Endpoint Fase 3: render async (carousel/video/auto-clip) + AI + trends.

import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// ---------------- carousel ----------------

export const CarouselSettingsSchema = z
  .object({
    style: z.enum(["outline", "box", "box_title_content", "plain"]).default("box").optional(),
    format: z.enum(["portrait", "portrait4_5", "square"]).default("portrait4_5").optional(),
    slideCount: z.number().int().min(3).max(10).default(6).optional(),
    boxOpacity: z.number().int().min(0).max(255).default(235).optional(),
    titleFontFamily: z.string().default("Fredoka").optional(),
    contentFontFamily: z.string().default("Fredoka").optional(),
    backgroundMode: z.enum(["library", "stock", "solid"]).default("solid").optional(),
    backgroundQuery: z.string().max(200).default("").optional(),
    aiLayout: z.object({ enabled: z.boolean().default(false).optional() }).optional(),
  })
  .openapi("CarouselSettings");

export const CarouselSlideSchema = z
  .object({
    title: z.string().min(1).max(80),
    body: z.string().max(600).optional(),
    backgroundMediaId: z.string().nullable().optional(),
  })
  .openapi("CarouselSlide");

export const CreateCarouselSchema = z
  .object({
    topic: z.string().min(3).max(300),
    slides: z.array(CarouselSlideSchema).min(1).max(11).optional(),
    caption: z.string().max(3000).optional(),
    settings: CarouselSettingsSchema,
  })
  .openapi("CreateCarouselRequest");

export const CreateCarouselResponseSchema = z
  .object({
    jobId: z.string(),
    status: z.literal("queued"),
    slideCount: z.number(),
  })
  .openapi("CreateCarouselResponse");

export const CarouselJobResponseSchema = z
  .object({
    job: z.object({
      id: z.string(),
      topic: z.string(),
      status: z.string(),
      progress: z.number(),
      settings: z.unknown(),
      caption: z.string().nullable(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
    slides: z.array(
      z.object({
        urutan: z.number(),
        title: z.string(),
        body: z.string().nullable(),
        stockCredit: z.string().nullable(),
        layout: z.string().nullable(),
        url: z.string().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        sizeBytes: z.number().nullable(),
      }),
    ),
  })
  .openapi("CarouselJobResponse");

// ---------------- video ----------------

export const VideoCaptionSettingsSchema = z
  .object({
    enabled: z.boolean().default(true).optional(),
    language: z.enum(["id", "en", "auto"]).default("id").optional(),
    model: z.enum(["tiny", "base", "small", "medium"]).default("base").optional(),
    fontSize: z.number().int().min(12).max(72).default(24).optional(),
    fontColor: z.string().default("white").optional(),
    position: z.enum(["bottom", "top", "center"]).default("bottom").optional(),
    wordHighlight: z.boolean().default(true).optional(),
  })
  .openapi("VideoCaptionSettings");

export const VideoHeadlineSettingsSchema = z
  .object({
    text: z.string().max(120).optional(),
    fontSize: z.number().int().min(16).max(120).default(48).optional(),
    fontColor: z.string().default("white").optional(),
    positionY: z.number().min(0).max(1).default(0.1).optional(),
  })
  .openapi("VideoHeadlineSettings");

export const CreateVideoSchema = z
  .object({
    baseVideoMediaId: z.string().min(1),
    clipMediaIds: z.array(z.string()).optional(),
    voiceoverMediaId: z.string().nullable().optional(),
    bgmAudioTrackId: z.string().nullable().optional(),
    publishToGallery: z.boolean().default(false).optional(),
    settings: z
      .object({
        orientation: z.enum(["portrait", "landscape", "square"]).default("portrait").optional(),
        resolution: z.enum(["720p", "1080p"]).default("1080p").optional(),
        removeOriginalAudio: z.boolean().default(true).optional(),
        voiceVolume: z.number().min(0).max(1).default(1).optional(),
        bgmVolume: z.number().min(0).max(1).default(0.3).optional(),
        montage: z
          .object({
            minSegmentSeconds: z.number().min(0.5).max(30).default(2).optional(),
            maxSegmentSeconds: z.number().min(0.5).max(60).default(5).optional(),
          })
          .nullable()
          .optional(),
        caption: VideoCaptionSettingsSchema.optional(),
        headline: VideoHeadlineSettingsSchema.nullable().optional(),
      })
      .openapi("VideoSettings"),
  })
  .openapi("CreateVideoRequest");

export const CreateVideoResponseSchema = z
  .object({
    job: z.object({
      id: z.string(),
      status: z.string(),
      progress: z.number(),
      createdAt: z.string().datetime(),
    }),
  })
  .openapi("CreateVideoResponse");

export const VideoJobResponseSchema = z
  .object({
    job: z.object({
      id: z.string(),
      status: z.string(),
      progress: z.number(),
      settings: z.unknown(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
      outputMediaId: z.string().nullable(),
      srtStorageKey: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
    }),
  })
  .openapi("VideoJobResponse");

// ---------------- auto-clip ----------------

export const CreateAutoClipSchema = z
  .object({
    sourceUrl: z.string().url().max(2000).nullable().optional(),
    sourceTier: z.enum(["t1", "t2"]).default("t1").optional(),
    baseVideoMediaId: z.string().nullable().optional(),
    clipSettings: z.object({
      targetClipCount: z.number().int().min(1).max(20).optional(),
      minDurationSec: z.number().min(5).max(600).optional(),
      maxDurationSec: z.number().min(10).max(1800).optional(),
      orientation: z.enum(["portrait", "landscape", "square"]).optional(),
      outputLanguage: z.string().min(2).max(20).optional(),
      userDirection: z.string().max(1000).nullable().optional(),
      captionEnabled: z.boolean().optional(),
    }),
    renderSettings: z
      .object({
        resolution: z.enum(["720p", "1080p"]).default("1080p").optional(),
        removeOriginalAudio: z.boolean().default(false).optional(),
        bgmVolume: z.number().min(0).max(1).default(0.3).optional(),
      })
      .optional(),
  })
  .openapi("CreateAutoClipRequest");

export const CreateAutoClipResponseSchema = z
  .object({
    job: z.object({
      id: z.string(),
      status: z.string(),
      progress: z.number(),
      createdAt: z.string().datetime(),
    }),
    detectedRanges: z.unknown(),
  })
  .openapi("CreateAutoClipResponse");

export const AutoClipJobResponseSchema = z
  .object({
    job: z.object({
      id: z.string(),
      status: z.string(),
      progress: z.number(),
      clipSettings: z.unknown(),
      urlSource: z.string().nullable(),
      urlSourceTier: z.string().nullable(),
      srtStorageKey: z.string().nullable(),
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      baseVideoName: z.string().nullable(),
      baseVideoThumbnailUrl: z.string().nullable(),
      baseVideoDuration: z.number().nullable(),
    }),
    segments: z.array(
      z.object({
        id: z.string(),
        order: z.number(),
        startSec: z.number(),
        endSec: z.number(),
        title: z.string(),
        viralScore: z.number().nullable(),
        hookText: z.string().nullable(),
        explicitRange: z.boolean().nullable(),
        status: z.string(),
        renderVideoJobId: z.string().nullable(),
        renderStatus: z.string().nullable(),
        renderProgress: z.number().nullable(),
        outputMediaId: z.string().nullable(),
      }),
    ),
  })
  .openapi("AutoClipJobResponse");

export const SelectAutoClipSchema = z
  .object({ segmentIds: z.array(z.string().min(1)).min(1).max(20) })
  .openapi("SelectAutoClipRequest");

export const SelectAutoClipResponseSchema = z
  .object({
    ok: z.literal(true),
    enqueuedCount: z.number(),
    renderJobIds: z.array(z.string()),
  })
  .openapi("SelectAutoClipResponse");

// ---------------- AI ----------------

export const AiUsageResponseSchema = z
  .object({
    configured: z.boolean(),
    used: z.number(),
    limit: z.number(),
    period: z.string().openapi({ example: "2026-09" }),
  })
  .openapi("AiUsageResponse");

export const AiCreditsSchema = z
  .object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
  })
  .openapi("AiCredits");

export const CaptionSchema = z
  .object({
    prompt: z.string().min(3).max(500),
    platform: z.enum([
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "linkedin_org",
      "pinterest",
      "threads",
      "x",
    ]),
    tone: z
      .enum(["santai", "profesional", "lucu", "inspiratif", "promosi"])
      .default("santai")
      .optional(),
    includeHashtags: z.boolean().default(true).optional(),
  })
  .openapi("CaptionRequest");

export const CaptionResponseSchema = z
  .object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    credits: AiCreditsSchema,
  })
  .openapi("CaptionResponse");

export const HashtagSchema = z
  .object({
    prompt: z.string().min(3).max(300),
    platform: z.enum([
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "linkedin_org",
      "pinterest",
      "threads",
      "x",
    ]),
    count: z.number().int().min(3).max(30).default(10).optional(),
  })
  .openapi("HashtagRequest");

export const HashtagResponseSchema = z
  .object({ hashtags: z.array(z.string()), credits: AiCreditsSchema })
  .openapi("HashtagResponse");

export const RewriteSchema = z
  .object({
    text: z.string().min(10).max(3000),
    platform: z.enum([
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "linkedin_org",
      "pinterest",
      "threads",
      "x",
    ]),
    style: z
      .enum(["lebih-santai", "lebih-formal", "lebih-pendek", "lebih-panjang", "hook-kuat", "seo"])
      .default("lebih-santai")
      .optional(),
  })
  .openapi("RewriteRequest");

export const RewriteResponseSchema = z
  .object({ text: z.string(), credits: AiCreditsSchema })
  .openapi("RewriteResponse");

export const RepurposeSchema = z
  .object({
    content: z.string().min(10).max(6000),
    targetPlatform: z.enum([
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "linkedin_org",
      "pinterest",
      "threads",
      "x",
    ]),
    tone: z.string().max(40).optional(),
  })
  .openapi("RepurposeRequest");

export const RepurposeResponseSchema = z
  .object({ content: z.string(), credits: AiCreditsSchema })
  .openapi("RepurposeResponse");

// ---------------- trends ----------------

export const TrendsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).optional().openapi({ default: 20 }),
});

export const TrendsResponseSchema = z
  .object({
    trends: z.array(
      z.object({
        title: z.string(),
        approxTraffic: z.string().nullable().optional(),
      }),
    ),
    fetchedAt: z.string().datetime(),
    available: z.boolean(),
  })
  .openapi("TrendsResponse");

export const TrendIdeasSchema = z
  .object({
    trend: z.string().min(2).max(200),
    platform: z.enum([
      "instagram",
      "facebook",
      "tiktok",
      "youtube",
      "linkedin",
      "pinterest",
      "threads",
      "x",
    ]),
    niche: z.string().max(120).optional(),
  })
  .openapi("TrendIdeasRequest");

export const TrendIdeasResponseSchema = z
  .object({
    ideas: z.array(
      z.object({
        title: z.string(),
        angle: z.string(),
        caption: z.string(),
        hashtags: z.array(z.string()),
      }),
    ),
    credits: AiCreditsSchema,
  })
  .openapi("TrendIdeasResponse");
