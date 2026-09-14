// Adapter Threads — container 2-step; teks bisa auto_publish_text 1-call
// Riset: docs/social-platforms/threads.md (Sep 2026)

import { httpRequest, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";
import { firstImage, firstVideo, GRAPH_THREADS, quotaHook } from "./meta-shared";

async function publishThreads(input: PublishInput): Promise<PublishResult> {
  const userId = input.platformAccountId;
  const text = composeCaption(input.content, input.hashtags);

  // Teks maks 500 karakter (byte UTF-8) — riset threads.md
  if (new TextEncoder().encode(text).length > 500) {
    throw new PublishError("threads_text_limit", "Teks Threads maksimal 500 karakter.", false);
  }

  const image = firstImage(input);
  const video = firstVideo(input);

  // Cross-post ke IG Stories (share to IG) — hanya berlaku untuk post media,
  // butuh scope threads_share_to_instagram (docs: share-to-ig-stories)
  const shareToIg = input.platformSettings.crossreshareToIg === true;

  if (!image && !video) {
    // Teks murni → auto_publish_text 1 call
    const res = await httpRequest<{ id?: string }>(`${GRAPH_THREADS}/${userId}/threads`, {
      method: "POST",
      query: {
        text,
        auto_publish_text: "true",
        access_token: input.accessToken,
      },
      onResponse: quotaHook("threads", input),
    });
    if (!res.ok) await throwFromResponse(res, "Threads text post");
    const data = await res.json();
    if (!data.id)
      throw new PublishError("threads_no_id", "Threads tidak mengembalikan media ID", true);
    return { status: "published", platformPostId: data.id };
  }

  // Media → container lalu publish
  const res = await httpRequest<{ id?: string }>(`${GRAPH_THREADS}/${userId}/threads`, {
    method: "POST",
    query: {
      text,
      image_url: image?.url,
      video_url: video?.url,
      // Share to IG: cross-post post Threads ini sebagai IG Story
      ...(shareToIg ? { crossreshare_to_ig: "true" } : {}),
      access_token: input.accessToken,
    },
  });
  if (!res.ok) await throwFromResponse(res, "Threads container");
  const containerId = (await res.json()).id;
  if (!containerId)
    throw new PublishError(
      "threads_no_container",
      "Threads tidak mengembalikan container ID",
      true,
    );

  // Publish container (biarkan worker poll bila masih IN_PROGRESS)
  const pub = await httpRequest<{ id?: string }>(`${GRAPH_THREADS}/${userId}/threads_publish`, {
    method: "POST",
    query: { creation_id: containerId, access_token: input.accessToken },
    onResponse: quotaHook("threads", input),
  });
  if (!pub.ok) await throwFromResponse(pub, "Threads publish");
  const mediaId = (await pub.json()).id;
  if (!mediaId)
    throw new PublishError("threads_no_media_id", "Threads publish tanpa media ID", true);
  return { status: "published", platformPostId: mediaId };
}

export const threadsAdapter: PlatformAdapter = {
  platform: "threads",
  async publish(input) {
    return publishThreads(input);
  },
};
