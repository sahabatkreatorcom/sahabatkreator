// Adapter Facebook Pages — 1-call photo/video/feed + native scheduling
// Riset: docs/social-platforms/meta-facebook.md (Sep 2026)

import { httpRequest, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";
import { firstImage, firstVideo, GRAPH_FB, quotaHook } from "./meta-shared";

/**
 * Page Mentions (fitur Meta, bukan scope OAuth) — sebut Halaman Facebook lain di
 * dalam teks post memakai format Graph `@[page-id]`. ID Halaman diambil dari
 * `platformSettings.mentions` (dipilih di Compose) dan di-append bila belum ada.
 */
function withPageMentions(message: string, mentions: unknown): string {
  if (!Array.isArray(mentions)) return message;
  const ids = mentions.filter((m): m is string => typeof m === "string" && m.length > 0);
  const tokens = [...new Set(ids)]
    .filter((id) => !message.includes(`@[${id}]`))
    .map((id) => `@[${id}]`);
  if (tokens.length === 0) return message;
  return message.trim() ? `${message.trimEnd()}\n\n${tokens.join(" ")}` : tokens.join(" ");
}

async function publishFacebook(input: PublishInput, scheduledAt?: Date): Promise<PublishResult> {
  const pageId = input.platformAccountId;
  const message = withPageMentions(
    composeCaption(input.content, input.hashtags),
    input.platformSettings.mentions,
  );
  const image = firstImage(input);
  const video = firstVideo(input);

  // Scheduling native FB: rentang valid 10 menit – 30 hari dari sekarang
  const scheduleValid =
    scheduledAt &&
    scheduledAt.getTime() > Date.now() + 10 * 60 * 1000 &&
    scheduledAt.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000;

  if (video) {
    // Video post — Graph mengunduh dari URL publik (R2) lalu memprosesnya,
    // jadi timeout perlu lebih panjang dari default 30s. Jika ada media campuran
    // (video + foto), video diprioritaskan.
    const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${pageId}/videos`, {
      method: "POST",
      query: {
        file_url: video.url,
        description: message,
        access_token: input.accessToken,
        ...(scheduleValid
          ? {
              published: "false",
              scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000),
            }
          : {}),
      },
      timeoutMs: 120_000,
      onResponse: quotaHook("facebook", input),
    });
    if (!res.ok) await throwFromResponse(res, "FB video");
    const data = await res.json();
    if (!data.id) {
      throw new PublishError("fb_no_video_id", "FB tidak mengembalikan video ID", true);
    }
    return {
      status: "published",
      platformPostId: data.id,
      platformPostUrl: `https://www.facebook.com/${pageId}/videos/${data.id}`,
      scheduledOnPlatform: Boolean(scheduleValid),
    };
  }

  if (image && input.media.filter((m) => m.type === "image").length === 1) {
    // Photo post
    const res = await httpRequest<{ post_id?: string; id?: string }>(
      `${GRAPH_FB}/${pageId}/photos`,
      {
        method: "POST",
        query: {
          url: image.url,
          caption: message,
          access_token: input.accessToken,
          ...(scheduleValid
            ? {
                published: "false",
                scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000),
              }
            : {}),
        },
      },
    );
    if (!res.ok) await throwFromResponse(res, "FB photo");
    const data = await res.json();
    const postId = data.post_id ?? data.id ?? "";
    return {
      status: "published",
      platformPostId: postId,
      platformPostUrl: `https://www.facebook.com/${pageId}/posts/${postId}`,
      scheduledOnPlatform: Boolean(scheduleValid),
    };
  }

  // Feed post (teks/link/multi-photo via attached_media — sederhanakan: link atau teks)
  const link =
    typeof input.platformSettings.link === "string" ? input.platformSettings.link : undefined;
  const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${pageId}/feed`, {
    method: "POST",
    query: {
      message,
      link,
      access_token: input.accessToken,
      ...(scheduleValid
        ? { published: "false", scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000) }
        : {}),
    },
    onResponse: quotaHook("facebook", input),
  });
  if (!res.ok) await throwFromResponse(res, "FB feed");
  const data = await res.json();
  if (!data.id) throw new PublishError("fb_no_post_id", "FB tidak mengembalikan post ID", true);
  return {
    status: "published",
    platformPostId: data.id,
    platformPostUrl: `https://www.facebook.com/${pageId}/posts/${String(data.id).split("_")[1] ?? data.id}`,
    scheduledOnPlatform: Boolean(scheduleValid),
  };
}

export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",
  async publish(input) {
    const scheduledAtRaw = input.platformSettings.scheduledAt;
    const scheduledAt =
      typeof scheduledAtRaw === "string" || typeof scheduledAtRaw === "number"
        ? new Date(scheduledAtRaw)
        : undefined;
    return publishFacebook(input, scheduledAt);
  },
};
