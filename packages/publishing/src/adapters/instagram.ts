// Adapter Instagram — via Facebook Login (graph.facebook.com, Page token)
// Flow riset: container → (poll status) → media_publish; carousel ≤10
// Riset: docs/social-platforms/meta-instagram.md (Sep 2026)

import { httpRequest, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";
import {
  fetchGraphPermalink,
  firstImage,
  firstVideo,
  GRAPH_FB,
  pollInstagram,
  publishStory,
  quotaHook,
} from "./meta-shared";

async function publishInstagramViaFb(input: PublishInput): Promise<PublishResult> {
  const igUserId = input.platformAccountId;
  const caption = composeCaption(input.content, input.hashtags);

  if (input.media.length === 0) {
    // IG tidak mendukung post teks murni → error jelas, jangan buang percobaan
    throw new PublishError(
      "ig_requires_media",
      "Instagram memerlukan minimal 1 foto atau video.",
      false,
    );
  }

  // Story: media_type STORIES — 1 media, tanpa caption, rasio 9:16
  // (riset: docs/social-platforms/meta-instagram.md — container → media_publish)
  if (input.platformSettings.postType === "story") {
    return publishStory(input, GRAPH_FB, "fb");
  }

  // Reels: wajib tepat 1 video (media_type REELS — dibaca di bawah)
  if (input.platformSettings.mediaType === "REELS") {
    const videos = input.media.filter((m) => m.type === "video");
    if (videos.length !== 1 || input.media.length !== 1) {
      throw new PublishError(
        "ig_reels_single_video",
        "Reels membutuhkan tepat 1 video — lepas media lain atau ubah jenis konten ke Feed.",
        false,
      );
    }
  }

  let creationId: string;

  if (input.media.length > 1) {
    // Carousel: buat container per item (max 10) → container utama
    if (input.media.length > 10) {
      throw new PublishError("ig_carousel_limit", "Maksimal 10 item carousel Instagram.", false);
    }
    const children: string[] = [];
    for (const m of input.media.slice(0, 10)) {
      const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${igUserId}/media`, {
        method: "POST",
        query: {
          is_carousel_item: true,
          image_url: m.type === "image" ? m.url : undefined,
          video_url: m.type === "video" ? m.url : undefined,
          caption: "",
          access_token: input.accessToken,
        },
      });
      if (!res.ok) await throwFromResponse(res, "IG carousel item");
      const id = (await res.json()).id;
      if (!id)
        throw new PublishError(
          "ig_no_container",
          "Platform tidak mengembalikan container ID",
          true,
        );
      children.push(id);
    }
    const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${igUserId}/media`, {
      method: "POST",
      query: {
        media_type: "CAROUSEL",
        caption,
        children: children.join(","),
        access_token: input.accessToken,
      },
    });
    if (!res.ok) await throwFromResponse(res, "IG carousel container");
    creationId = (await res.json()).id!;
  } else {
    const image = firstImage(input);
    const video = firstVideo(input);
    const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${igUserId}/media`, {
      method: "POST",
      query: {
        image_url: image?.url,
        video_url: video?.url,
        // Video feed biasa; Reels ditentukan via platformSettings bila user memilih
        media_type: video ? String(input.platformSettings.mediaType ?? "VIDEO") : undefined,
        caption,
        access_token: input.accessToken,
      },
    });
    if (!res.ok) await throwFromResponse(res, "IG container");
    creationId = (await res.json()).id!;
  }

  if (!creationId) {
    throw new PublishError("ig_no_container", "Platform tidak mengembalikan container ID", true);
  }

  // Video butuh waktu processing — publish langsung bisa error. Untuk image langsung publish.
  // Flow async konsisten: return processing dan biarkan worker poll + publish final.
  const video =
    firstVideo(input) || input.media.length > 1
      ? input.media.some((m) => m.type === "video")
      : false;
  if (video) {
    return { status: "processing", handle: `ig:${creationId}` };
  }

  // Image: publish segera
  const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${igUserId}/media_publish`, {
    method: "POST",
    query: { creation_id: creationId, access_token: input.accessToken },
    onResponse: quotaHook("instagram", input),
  });
  if (!res.ok) await throwFromResponse(res, "IG publish");
  const mediaId = (await res.json()).id;
  if (!mediaId)
    throw new PublishError("ig_no_media_id", "Publish sukses tapi media ID kosong", true);
  return {
    status: "published",
    platformPostId: mediaId,
    platformPostUrl: await fetchGraphPermalink(GRAPH_FB, input.accessToken, mediaId),
  };
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",
  async publish(input) {
    // scheduledAt diteruskan via platformSettings oleh pipeline
    return publishInstagramViaFb(input);
  },
  async checkStatus({ accessToken, platformAccountId, handle }) {
    const r = await pollInstagram({ accessToken, platformAccountId, handle, mode: "fb" });
    return r.status === "published"
      ? {
          status: "published",
          platformPostId: r.platformPostId,
          platformPostUrl: r.platformPostUrl,
        }
      : { status: "processing" };
  },
};
