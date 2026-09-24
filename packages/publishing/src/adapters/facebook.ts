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

/**
 * Append link ke teks post (caption/description) saat endpoint Graph tidak
 * menerima param `link` (photo & video posts). Hindari duplikat bila link sudah
 * ada di teks (mis. user tulis sendiri di caption).
 */
function appendLinkToText(text: string, link: string): string {
  if (!link) return text;
  if (text.includes(link)) return text;
  return text.trim() ? `${text.trimEnd()}\n\n${link}` : link;
}

async function publishFacebook(input: PublishInput, scheduledAt?: Date): Promise<PublishResult> {
  const pageId = input.platformAccountId;
  const message = withPageMentions(
    composeCaption(input.content, input.hashtags),
    input.platformSettings.mentions,
  );
  const link =
    typeof input.platformSettings.link === "string" && input.platformSettings.link.trim()
      ? input.platformSettings.link.trim()
      : undefined;
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
    // Endpoint /videos tidak menerima param `link` — link di-append ke
    // description sebagai fallback (field "Link pada post" tetap berfungsi).
    const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${pageId}/videos`, {
      method: "POST",
      query: {
        file_url: video.url,
        description: link ? appendLinkToText(message, link) : message,
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
    // Endpoint /photos tidak menerima param `link` — link di-append ke
    // caption sebagai fallback (field "Link pada post" tetap berfungsi).
    const res = await httpRequest<{ post_id?: string; id?: string }>(
      `${GRAPH_FB}/${pageId}/photos`,
      {
        method: "POST",
        query: {
          url: image.url,
          caption: link ? appendLinkToText(message, link) : message,
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

  const images = input.media.filter((m) => m.type === "image");
  if (images.length > 1) {
    // Multi-photo post (carousel feed) — RFC docs/rfc-carousel-render.md §8.
    // Flow: upload tiap foto sebagai unpublished (published=false) → dapat
    // media_fbid → pasang ke /feed via attached_media[]. Limit 10 (Graph).
    if (images.length > 10) {
      throw new PublishError(
        "fb_carousel_limit",
        "Maksimal 10 foto pada post multi-foto Facebook.",
        false,
      );
    }

    const fbIds: string[] = [];
    for (const img of images.slice(0, 10)) {
      const up = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${pageId}/photos`, {
        method: "POST",
        query: {
          url: img.url,
          published: "false",
          access_token: input.accessToken,
        },
        onResponse: quotaHook("facebook", input),
      });
      if (!up.ok) await throwFromResponse(up, "FB carousel photo");
      const upData = await up.json();
      if (!upData.id) {
        throw new PublishError("fb_no_media_fbid", "FB tidak mengembalikan media_fbid", true);
      }
      fbIds.push(upData.id);
    }

    // attached_media[0]={"media_fbid":"..."} — param array Graph style
    const attachedMedia: Record<string, string> = {};
    fbIds.forEach((id, i) => {
      attachedMedia[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
    });

    const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${pageId}/feed`, {
      method: "POST",
      query: {
        message: link ? appendLinkToText(message, link) : message,
        ...attachedMedia,
        access_token: input.accessToken,
        ...(scheduleValid
          ? {
              published: "false",
              scheduled_publish_time: Math.floor(scheduledAt.getTime() / 1000),
            }
          : {}),
      },
      onResponse: quotaHook("facebook", input),
    });
    if (!res.ok) await throwFromResponse(res, "FB feed multi-photo");
    const data = await res.json();
    if (!data.id) throw new PublishError("fb_no_post_id", "FB tidak mengembalikan post ID", true);
    return {
      status: "published",
      platformPostId: data.id,
      platformPostUrl: `https://www.facebook.com/${pageId}/posts/${String(data.id).split("_")[1] ?? data.id}`,
      scheduledOnPlatform: Boolean(scheduleValid),
    };
  }

  // Feed post (teks/link — multi-foto sudah ditangani attached_media di atas)
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
