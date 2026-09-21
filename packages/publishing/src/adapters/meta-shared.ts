// Helper bersama adapter Meta Graph — dipakai instagram.ts, instagram-standalone.ts,
// facebook.ts, threads.ts (host Graph, kuota BUC hook, poll container IG)

import { GRAPH_FB_URL, GRAPH_IG_URL, GRAPH_THREADS_URL } from "../config";
import { httpRequest, throwFromResponse } from "../http";
import { recordQuotaFromHeaders } from "../quota";
import { PublishError, type PublishInput, type PublishResult } from "../types";

/** Rekam kuota BUC Meta dari response header (entity = platformAccountId akun) */
export function quotaHook(platform: string, input: Pick<PublishInput, "platformAccountId">) {
  return (res: { headers: Headers }) =>
    void recordQuotaFromHeaders(platform, input.platformAccountId, res.headers);
}

// Endpoint Graph API — single source of truth di config.ts (jangan hardcode per-module)
export const GRAPH_FB = GRAPH_FB_URL;
export const GRAPH_IG = GRAPH_IG_URL;
export const GRAPH_THREADS = GRAPH_THREADS_URL;

export function firstImage(input: PublishInput) {
  return input.media.find((m) => m.type === "image");
}
export function firstVideo(input: PublishInput) {
  return input.media.find((m) => m.type === "video");
}

/**
 * Publish IG/FB Story: container media_type=STORIES → (poll video) → media_publish.
 * Story hanya 1 media (image/video), tanpa caption (Graph mengabaikan caption story).
 * Rasio ideal 9:16 (1080×1920) — divalidasi di sisi server web sebelum enqueue.
 */
export async function publishStory(
  input: PublishInput,
  base: string,
  mode: "fb" | "standalone",
): Promise<PublishResult> {
  const igUserId = input.platformAccountId;
  // Story hanya 1 media — video diprioritaskan bila keduanya ada
  const video = firstVideo(input);
  const image = video ? undefined : firstImage(input);
  const media = image ?? video;

  if (!media) {
    throw new PublishError(
      "ig_story_requires_media",
      "Story memerlukan minimal 1 foto atau video (rasio 9:16).",
      false,
    );
  }

  const res = await httpRequest<{ id?: string }>(`${base}/${igUserId}/media`, {
    method: "POST",
    query: {
      media_type: "STORIES",
      image_url: image?.url,
      video_url: video?.url,
      access_token: input.accessToken,
    },
  });
  if (!res.ok) await throwFromResponse(res, "IG story container");
  const creationId = (await res.json()).id;
  if (!creationId) {
    throw new PublishError("ig_no_container", "Platform tidak mengembalikan container ID", true);
  }

  // Flow async konsisten: media_publish hanya valid setelah container FINISHED —
  // biarkan worker poll (image sekalipun butuh waktu diproses Meta) lalu publish final.
  return {
    status: "processing",
    handle: mode === "fb" ? `ig:${creationId}` : `igs:${creationId}`,
  };
}

/** Poll status container IG kedua jalur; saat FINISHED lakukan media_publish final */
export async function pollInstagram(input: {
  accessToken: string;
  platformAccountId: string;
  handle: string;
  mode: "fb" | "standalone";
}): Promise<
  | { status: "processing" }
  | { status: "published"; platformPostId: string; platformPostUrl?: string | null }
> {
  const [, containerId] = input.handle.split(":");
  if (!containerId) return { status: "processing" };
  const base = input.mode === "fb" ? GRAPH_FB : GRAPH_IG;

  const res = await httpRequest<{ status_code?: string }>(`${base}/${containerId}`, {
    query: { fields: "status_code", access_token: input.accessToken },
  });
  if (!res.ok) await throwFromResponse(res, "IG container status");
  const { status_code } = await res.json();

  if (status_code === "FINISHED") {
    // Container siap → publish final
    const pub = await httpRequest<{ id?: string }>(
      `${base}/${input.platformAccountId}/media_publish`,
      {
        method: "POST",
        query: { creation_id: containerId, access_token: input.accessToken },
        onResponse: quotaHook(input.mode === "fb" ? "instagram" : "instagram_standalone", input),
      },
    );
    if (!pub.ok) await throwFromResponse(pub, "IG publish");
    const mediaId = (await pub.json()).id;
    if (!mediaId) return { status: "processing" };
    return {
      status: "published",
      platformPostId: mediaId,
      platformPostUrl: await fetchGraphPermalink(base, input.accessToken, mediaId),
    };
  }
  if (status_code === "EXPIRED" || status_code === "ERROR") {
    throw new PublishError(
      `ig_container_${status_code?.toLowerCase()}`,
      `Container IG ${status_code}`,
      false,
    );
  }
  return { status: "processing" };
}

/**
 * Ambil permalink konten Graph (IG/Threads) — best-effort: kegagalan diabaikan
 * (URL null, post tetap sukses). 1 call GET {id}?fields=permalink.
 */
export async function fetchGraphPermalink(
  base: string,
  accessToken: string,
  mediaId: string,
): Promise<string | null> {
  try {
    const res = await httpRequest<{ permalink?: string }>(`${base}/${mediaId}`, {
      query: { fields: "permalink", access_token: accessToken },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.permalink ?? null;
  } catch {
    return null;
  }
}
