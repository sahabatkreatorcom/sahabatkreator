// Adapter Repliz bridge — publish semua platform via Schedule API Repliz.
// Dipakai pipeline bila akun tersambung via bridge (metadata.replizAccountId).
// accessToken = base64(accessKey:secretKey) kredensial Repliz (bukan token platform);
// platformAccountId = replizAccountId (ID akun di workspace Repliz).

import {
  type ReplizMedia,
  type ReplizScheduleInput,
  replizCreateSchedule,
  replizGetSchedule,
} from "../repliz";
import type { PlatformAdapter, PublishInput, PublishResult } from "../types";
import { composeCaption, PublishError } from "../types";

/** Mapping jenis konten kita → type schedule Repliz */
function buildScheduleType(input: PublishInput, platform: string): ReplizScheduleInput["type"] {
  const images = input.media.filter((m) => m.type === "image");
  const videos = input.media.filter((m) => m.type === "video");
  // UI compose mengirim postType: "story" (IG kedua jalur) → type "story"
  if (
    input.platformSettings?.postType === "story" &&
    (platform === "instagram" || platform === "instagram_standalone")
  ) {
    return "story";
  }
  if (videos.length > 0) {
    // IG reels eksplisit → "reel" (video pendek vertikal); TikTok/IG lain "video"
    if (input.platformSettings?.postType === "reels") return "reel";
    return "video";
  }
  if (images.length > 1) return "album";
  if (images.length === 1) return "image";
  return "text";
}

function buildMedias(input: PublishInput): ReplizMedia[] {
  return input.media
    .filter((m) => m.type === "image" || m.type === "video")
    .map((m) => ({
      type: m.type as "image" | "video",
      url: m.url,
      alt: m.altText ?? undefined,
    }));
}

/**
 * Link dari field "Link pada post (opsional)" (Facebook).
 *
 * Repliz menangani link dua cara:
 * - post TANPA media → type "link" + meta.url (preview card native Facebook);
 * - post DENGAN media → API tidak menerima meta pada type image/video/album,
 *   jadi link di-append ke description (sama seperti adapter FB native).
 *
 * Tidak menduplikasi bila link sudah ada di caption.
 */
function linkFromSettings(input: PublishInput): string | undefined {
  const raw = input.platformSettings?.link;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function appendLinkToText(text: string, link: string): string {
  if (!link) return text;
  if (text.includes(link)) return text;
  return text.trim() ? `${text.trimEnd()}\n\n${link}` : link;
}

/** Platform key Repliz dari platform enum kita (fallback "facebook") */
const REPLIZ_TYPE: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  instagram_standalone: "instagram",
  threads: "threads",
  tiktok: "tiktok",
  youtube: "youtube",
  linkedin: "linkedin",
  // App LinkedIn Repliz satu untuk personal + company — konsisten dgn REPLIZ_PLATFORMS
  linkedin_org: "linkedin",
};

export const replizAdapter: PlatformAdapter = {
  platform: "repliz",

  async publish(input: PublishInput): Promise<PublishResult> {
    // platform "virtual" asli dikirim lewat platformSettings oleh pipeline
    const platform = String(input.platformSettings?.replizTargetPlatform ?? "facebook");
    const type = REPLIZ_TYPE[platform];
    if (!type) {
      throw new PublishError(
        "repliz_unsupported_platform",
        `Platform ${platform} tidak didukung Repliz.`,
        false,
      );
    }

    const scheduleAt =
      typeof input.platformSettings?.scheduledAt === "string" && input.platformSettings.scheduledAt
        ? input.platformSettings.scheduledAt
        : new Date().toISOString();

    const description = composeCaption(input.content, input.hashtags);
    const link = linkFromSettings(input);
    const medias = buildMedias(input);
    if (!description.trim() && medias.length === 0 && !link) {
      throw new PublishError(
        "empty_content",
        "Konten kosong — Repliz menolak post tanpa caption/media.",
        false,
      );
    }

    // Repliz "link" type (Facebook only) → preview card native, tapi WAJIB
    // menyertakan minimal 1 gambar sebagai banner (API menolak medias kosong).
    // Dipakai hanya untuk FB + link + tepat 1 gambar tanpa video.
    const hasImage = input.media.some((m) => m.type === "image");
    const hasVideo = input.media.some((m) => m.type === "video");
    const useLinkType = Boolean(link) && platform === "facebook" && hasImage && !hasVideo;
    const finalDescription = !link
      ? description
      : useLinkType
        ? description.trim() || link // link sudah ada di meta.url; caption kosong → fallback link
        : appendLinkToText(description, link); // media/text post: link disisipkan ke caption

    const scheduleId = await replizCreateSchedule(
      {
        accessKey: decodeBasic(input.accessToken).key,
        secretKey: decodeBasic(input.accessToken).secret,
      },
      {
        title: input.platformSettings?.title ? String(input.platformSettings.title) : undefined,
        description: finalDescription,
        type: useLinkType ? "link" : buildScheduleType(input, platform),
        medias,
        accountId: input.platformAccountId, // replizAccountId
        scheduleAt,
        topic: platform,
        ...(useLinkType && link ? { meta: { url: link } } : {}),
      },
    );

    // Schedule Repliz selalu async (status pending → process → success/error) → poll
    return { status: "processing", handle: scheduleId };
  },

  async checkStatus(input: {
    accessToken: string;
    platformAccountId: string;
    handle: string;
  }): Promise<AsyncPostStatusReturnType> {
    const { key, secret } = decodeBasic(input.accessToken);
    const sched = await replizGetSchedule(
      { accessKey: key, secretKey: secret },
      input.handle,
      input.platformAccountId,
    );
    if (!sched) return { status: "processing" };
    if (sched.status === "success") {
      return {
        status: "published",
        platformPostId: sched.postId ?? sched.id,
        platformPostUrl: null,
      };
    }
    if (sched.status === "error") {
      return {
        status: "failed",
        code: "repliz_schedule_error",
        message: "Publish via Repliz gagal.",
        retryable: false,
      };
    }
    return { status: "processing" };
  },
};

type AsyncPostStatusReturnType = Awaited<ReturnType<NonNullable<PlatformAdapter["checkStatus"]>>>;

/** Decode accessToken format "basic:<base64(accessKey:secretKey)>" → kredensial Repliz */
function decodeBasic(accessToken: string): { key: string; secret: string } {
  if (!accessToken.startsWith("basic:")) {
    throw new PublishError(
      "repliz_bad_credentials",
      "Kredensial Repliz tidak valid (format basic).",
      false,
    );
  }
  const decoded = Buffer.from(accessToken.slice("basic:".length), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx <= 0) {
    throw new PublishError(
      "repliz_bad_credentials",
      "Kredensial Repliz tidak valid (parse).",
      false,
    );
  }
  return { key: decoded.slice(0, idx), secret: decoded.slice(idx + 1) };
}
