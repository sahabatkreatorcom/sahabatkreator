// Adapter Instagram standalone — Instagram Login (graph.instagram.com, IG user token)
// Jalur onboarding ringan tanpa FB Page. Endpoint sama dengan jalur FB
// (container → media_publish), host & token berbeda.
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
  firstImage,
  firstVideo,
  GRAPH_IG,
  pollInstagram,
  publishStory,
  quotaHook,
} from "./meta-shared";

async function publishInstagramStandalone(input: PublishInput): Promise<PublishResult> {
  const igUserId = input.platformAccountId;
  const caption = composeCaption(input.content, input.hashtags);

  if (input.media.length === 0) {
    throw new PublishError(
      "ig_requires_media",
      "Instagram memerlukan minimal 1 foto atau video.",
      false,
    );
  }

  // Story: jalur sama (container STORIES), host graph.instagram.com
  if (input.platformSettings.postType === "story") {
    return publishStory(input, GRAPH_IG, "standalone");
  }

  // Reels: wajib tepat 1 video (media_type REELS)
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

  const image = firstImage(input);
  const video = firstVideo(input);
  const res = await httpRequest<{ id?: string }>(`${GRAPH_IG}/${igUserId}/media`, {
    method: "POST",
    query: {
      image_url: image?.url,
      video_url: video?.url,
      // Video feed biasa; Reels dipilih user via platformSettings.mediaType
      media_type: video ? String(input.platformSettings.mediaType ?? "VIDEO") : undefined,
      caption,
      access_token: input.accessToken,
    },
  });
  if (!res.ok) await throwFromResponse(res, "IG standalone container");
  const creationId = (await res.json()).id;
  if (!creationId)
    throw new PublishError("ig_no_container", "Platform tidak mengembalikan container ID", true);

  if (video) {
    return { status: "processing", handle: `igs:${creationId}` };
  }

  const publishRes = await httpRequest<{ id?: string }>(`${GRAPH_IG}/${igUserId}/media_publish`, {
    method: "POST",
    query: { creation_id: creationId, access_token: input.accessToken },
    onResponse: quotaHook("instagram_standalone", input),
  });
  if (!publishRes.ok) await throwFromResponse(publishRes, "IG standalone publish");
  const mediaId = (await publishRes.json()).id;
  if (!mediaId)
    throw new PublishError("ig_no_media_id", "Publish sukses tapi media ID kosong", true);
  return { status: "published", platformPostId: mediaId };
}

export const instagramStandaloneAdapter: PlatformAdapter = {
  platform: "instagram_standalone",
  async publish(input) {
    return publishInstagramStandalone(input);
  },
  async checkStatus({ accessToken, platformAccountId, handle }) {
    const r = await pollInstagram({ accessToken, platformAccountId, handle, mode: "standalone" });
    return r.status === "published"
      ? { status: "published", platformPostId: r.platformPostId }
      : { status: "processing" };
  },
};
