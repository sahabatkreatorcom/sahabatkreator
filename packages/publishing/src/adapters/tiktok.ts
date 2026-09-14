// Adapter TikTok — Content Posting API v2
// Riset: docs/social-platforms/tiktok.md (Sep 2026)
//
// Flow Direct Post: video/init (PULL_FROM_URL) → return processing → worker poll status/fetch
// Flow Photo: content/init (PULL_FROM_URL, max 35 foto)
// Upload URL-based: domain R2 harus terverifikasi di TikTok dev console.

import { httpRequest, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";

const TIKTOK_BASE = "https://open.tiktokapis.com/v2/post/publish";

type TikTokInitResponse = {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: { code?: string; message?: string; log_id?: string };
};

async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  const caption = composeCaption(input.content, input.hashtags);
  const videos = input.media.filter((m) => m.type === "video");
  const photos = input.media.filter((m) => m.type === "image");

  if (videos.length === 0 && photos.length === 0) {
    // TikTok tanpa media → gunakan photo post dengan 0 foto tidak valid → error jelas
    throw new PublishError(
      "tiktok_requires_media",
      "TikTok memerlukan minimal 1 video atau foto.",
      false,
    );
  }

  if (videos.length > 0) {
    // ---- Direct Post video via PULL_FROM_URL ----
    const video = videos[0]!;
    if (videos.length > 1) {
      throw new PublishError(
        "tiktok_single_video",
        "TikTok hanya mendukung 1 video per post.",
        false,
      );
    }
    if (caption.length > 2200) {
      throw new PublishError(
        "tiktok_caption_limit",
        "Caption TikTok maksimal 2200 karakter.",
        false,
      );
    }

    // privacy_level wajib & harus cocok privacy_level_options akun (riset: beda per akun)
    const privacyLevel = String(input.platformSettings.privacyLevel ?? "SELF_ONLY");
    const res = await httpRequest<TikTokInitResponse>(`${TIKTOK_BASE}/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: privacyLevel,
          // Label AI-generated (riset: is_aigc mandatory utk konten AI)
          is_aigc: input.platformSettings.isAigc === true,
          disable_comment: input.platformSettings.disableComment === true,
          disable_duet: input.platformSettings.disableDuet === true,
          disable_stitch: input.platformSettings.disableStitch === true,
          brand_content_toggle: input.platformSettings.brandContent === true,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: video.url,
        },
      }),
      retries: 1, // init rate limit ketat 6/mnt — jangan agresif retry
    });
    if (!res.ok) await throwFromResponse(res, "TikTok video init");
    const data = await res.json();
    if (data.error?.code && data.error.code !== "ok") {
      throw new PublishError(
        `tiktok_${data.error.code}`,
        `TikTok: ${data.error.message ?? data.error.code}${data.error.log_id ? ` (log_id: ${data.error.log_id})` : ""}`,
        data.error.code === "rate_limit_exceeded",
      );
    }
    if (!data.data?.publish_id) {
      throw new PublishError("tiktok_no_publish_id", "TikTok tidak mengembalikan publish_id", true);
    }
    // Async: TikTok mendownload video & moderasi → worker poll
    return { status: "processing", handle: data.data.publish_id };
  }

  // ---- Photo post (carousel foto) via content/init ----
  if (photos.length > 35) {
    throw new PublishError("tiktok_photo_limit", "Maksimal 35 foto per post TikTok.", false);
  }
  const res = await httpRequest<TikTokInitResponse>(`${TIKTOK_BASE}/content/init/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 90),
        description: caption.slice(0, 4000),
        privacy_level: String(input.platformSettings.privacyLevel ?? "SELF_ONLY"),
        is_aigc: input.platformSettings.isAigc === true,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: photos.map((p) => p.url),
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
    retries: 1,
  });
  if (!res.ok) await throwFromResponse(res, "TikTok photo init");
  const data = await res.json();
  if (data.error?.code && data.error.code !== "ok") {
    throw new PublishError(
      `tiktok_${data.error.code}`,
      `TikTok: ${data.error.message ?? data.error.code}${data.error.log_id ? ` (log_id: ${data.error.log_id})` : ""}`,
      data.error.code === "rate_limit_exceeded",
    );
  }
  if (!data.data?.publish_id) {
    throw new PublishError("tiktok_no_publish_id", "TikTok tidak mengembalikan publish_id", true);
  }
  return { status: "processing", handle: data.data.publish_id };
}

/** Poll status TikTok via status/fetch */
async function checkTikTokStatus(input: {
  accessToken: string;
  handle: string;
}): Promise<AsyncStatus> {
  const res = await httpRequest<{
    data?: { status?: string; publicly_available_post_id?: string; fail_reason?: string };
    error?: { code?: string; message?: string; log_id?: string };
  }>("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: input.handle }),
  });
  if (!res.ok) await throwFromResponse(res, "TikTok status fetch");
  const data = await res.json();
  if (data.error?.code && data.error.code !== "ok") {
    return {
      status: "failed",
      code: `tiktok_${data.error.code}`,
      message: data.error.message ?? "",
      retryable: false,
    };
  }
  const status = data.data?.status;
  if (status === "PUBLISH_COMPLETE") {
    return {
      status: "published",
      platformPostId: data.data?.publicly_available_post_id ?? input.handle,
    };
  }
  if (status === "FAILED" || status === "PUBLISH_FAILED") {
    return {
      status: "failed",
      code: "tiktok_publish_failed",
      message: `${data.data?.fail_reason ?? "Publish TikTok gagal"}${data.error?.log_id ? ` (log_id: ${data.error.log_id})` : ""}`,
      retryable: false,
    };
  }
  return { status: "processing" };
}

type AsyncStatus =
  | { status: "processing" }
  | { status: "published"; platformPostId: string }
  | { status: "failed"; code: string; message: string; retryable: boolean };

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",
  publish: publishTikTok,
  async checkStatus({ accessToken, handle }) {
    const r = await checkTikTokStatus({ accessToken, handle });
    if (r.status === "published") return { status: "published", platformPostId: r.platformPostId };
    if (r.status === "failed")
      return { status: "failed", code: r.code, message: r.message, retryable: r.retryable };
    return { status: "processing" };
  },
};
