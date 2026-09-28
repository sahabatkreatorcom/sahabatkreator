// Adapter Threads — container 2-step; teks bisa auto_publish_text 1-call
// Riset: docs/social-platforms/threads.md (Sep 2026)

import { httpRequest, throwFromResponse } from "../http";
import {
  type AsyncPostStatus,
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
  GRAPH_THREADS,
  quotaHook,
} from "./meta-shared";

async function publishThreads(input: PublishInput): Promise<PublishResult> {
  const userId = input.platformAccountId;
  const text = composeCaption(input.content, input.hashtags);

  // Teks maks 500 karakter (byte UTF-8) — riset threads.md
  if (new TextEncoder().encode(text).length > 500) {
    throw new PublishError("threads_text_limit", "Teks Threads maksimal 500 karakter.", false);
  }

  const image = firstImage(input);
  const video = firstVideo(input);

  // Audio tidak didukung Threads; lebih baik gagal jelas daripada post text-only senyap
  if (input.media.length > 0 && !image && !video) {
    throw new PublishError(
      "threads_media_unsupported",
      "Threads hanya mendukung foto atau video — lepas file audio-nya.",
      false,
    );
  }
  // Threads 1 media per post (carousel via children belum didukung)
  if (input.media.length > 1) {
    throw new PublishError(
      "threads_single_media",
      "Threads hanya mendukung 1 media per post — pisahkan medianya.",
      false,
    );
  }

  // Cross-post ke IG Stories (share to IG) — hanya berlaku untuk post media,
  // butuh scope threads_share_to_instagram (docs: share-to-ig-stories)
  const shareToIg = input.platformSettings.crossreshareToIg === true;

  // Tag lokasi (threads_location_tagging) — ID dari location_search di Compose
  const locationId =
    typeof input.platformSettings.locationId === "string"
      ? input.platformSettings.locationId
      : undefined;

  if (!image && !video) {
    // Teks murni → auto_publish_text 1 call (media_type tetap wajib per docs)
    const res = await httpRequest<{ id?: string }>(`${GRAPH_THREADS}/${userId}/threads`, {
      method: "POST",
      query: {
        media_type: "TEXT",
        text,
        auto_publish_text: "true",
        ...(locationId ? { location_id: locationId } : {}),
        access_token: input.accessToken,
      },
      onResponse: quotaHook("threads", input),
    });
    if (!res.ok) await throwFromResponse(res, "Threads text post");
    const data = await res.json();
    if (!data.id)
      throw new PublishError("threads_no_id", "Threads tidak mengembalikan media ID", true);
    return {
      status: "published",
      platformPostId: data.id,
      platformPostUrl: await fetchGraphPermalink(GRAPH_THREADS, input.accessToken, data.id),
    };
  }

  // Media → container (media_type WAJIB: IMAGE/VIDEO — tanpa ini Meta tolak [100])
  // lalu threads_publish SETELAH status FINISHED (docs: tunggu ±30 detik, polling).
  const res = await httpRequest<{ id?: string }>(`${GRAPH_THREADS}/${userId}/threads`, {
    method: "POST",
    query: {
      media_type: image ? "IMAGE" : "VIDEO",
      text,
      image_url: image?.url,
      video_url: video?.url,
      // Share to IG: cross-post post Threads ini sebagai IG Story
      ...(shareToIg ? { crossreshare_to_ig: "true" } : {}),
      ...(locationId ? { location_id: locationId } : {}),
      access_token: input.accessToken,
    },
    onResponse: quotaHook("threads", input),
  });
  if (!res.ok) await throwFromResponse(res, "Threads container");
  const containerId = (await res.json()).id;
  if (!containerId)
    throw new PublishError(
      "threads_no_container",
      "Threads tidak mengembalikan container ID",
      true,
    );

  // Flow async: worker poll status container, threads_publish final saat FINISHED.
  // (Publish langsung setelah container dibuat → container belum siap diproses.)
  return { status: "processing", handle: `threads:${containerId}` };
}

/**
 * Poll container Threads → threads_publish saat FINISHED.
 * Status: IN_PROGRESS | FINISHED | PUBLISHED | ERROR | EXPIRED (docs threads.md).
 */
async function checkThreadsStatus(input: {
  accessToken: string;
  platformAccountId: string;
  handle: string;
}): Promise<AsyncPostStatus> {
  const containerId = input.handle.split(":")[1];
  if (!containerId) return { status: "processing" };

  const res = await httpRequest<{ status?: string; error_message?: string }>(
    `${GRAPH_THREADS}/${containerId}`,
    { query: { fields: "status,error_message", access_token: input.accessToken } },
  );
  if (!res.ok) await throwFromResponse(res, "Threads container status");
  const { status, error_message } = await res.json();

  // Sudah terpublish tapi media ID tak tercatat (respons threads_publish hilang) —
  // anggap sukses; permalink best-effort dari container ID.
  if (status === "PUBLISHED") {
    return {
      status: "published",
      platformPostId: containerId,
      platformPostUrl: await fetchGraphPermalink(GRAPH_THREADS, input.accessToken, containerId),
    };
  }

  if (status === "FINISHED") {
    // Container siap → publish final
    const pub = await httpRequest<{ id?: string }>(
      `${GRAPH_THREADS}/${input.platformAccountId}/threads_publish`,
      {
        method: "POST",
        query: { creation_id: containerId, access_token: input.accessToken },
        onResponse: quotaHook("threads", { platformAccountId: input.platformAccountId }),
      },
    );
    if (!pub.ok) await throwFromResponse(pub, "Threads publish");
    const mediaId = (await pub.json()).id;
    if (!mediaId) return { status: "processing" };
    return {
      status: "published",
      platformPostId: mediaId,
      platformPostUrl: await fetchGraphPermalink(GRAPH_THREADS, input.accessToken, mediaId),
    };
  }

  if (status === "ERROR" || status === "EXPIRED") {
    return {
      status: "failed",
      code: `threads_container_${status.toLowerCase()}`,
      message: `Container Threads ${status}${error_message ? `: ${error_message}` : ""}`,
      retryable: false,
    };
  }
  return { status: "processing" };
}

export const threadsAdapter: PlatformAdapter = {
  platform: "threads",
  async publish(input) {
    return publishThreads(input);
  },
  async checkStatus({ accessToken, platformAccountId, handle }) {
    return checkThreadsStatus({ accessToken, platformAccountId, handle });
  },
};
