// Adapter Pinterest — API v5
// POST /v5/pins — image via image_url (1-call);
// video via media register → S3 upload → poll → pin (4 step, async)
// platformAccountId = board_id tujuan
// Riset: docs/social-platforms/pinterest.md (Sep 2026)

import { PINTEREST_API_BASE_URL as PINTEREST_BASE } from "../config";
import { downloadMediaBlob, httpRequest, httpUpload, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";
import { quotaHook } from "./meta-shared";

async function publishPinterest(input: PublishInput): Promise<PublishResult> {
  const boardId = input.platformAccountId;
  if (!boardId) {
    throw new PublishError("pinterest_no_board", "Board Pinterest tujuan belum dipilih.", false);
  }
  const description = composeCaption(input.content, input.hashtags);

  const image = input.media.find((m) => m.type === "image");
  const video = input.media.find((m) => m.type === "video");
  if (image && video) {
    throw new PublishError(
      "pinterest_mixed_media",
      "Pinterest hanya mendukung 1 gambar ATAU 1 video per pin — pisahkan videonya.",
      false,
    );
  }

  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
  };

  if (image) {
    // Carousel organik tidak didukung lagi (riset) → single image pin
    const title = String(input.platformSettings.title ?? input.content.slice(0, 100));
    const res = await httpRequest<{ id?: string }>(`${PINTEREST_BASE}/pins`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        board_id: boardId,
        title: title.slice(0, 100),
        description: description.slice(0, 800),
        alt_text: (image.altText ?? "").slice(0, 500) || undefined,
        link:
          typeof input.platformSettings.link === "string"
            ? input.platformSettings.link.slice(0, 2048)
            : undefined,
        media_source: {
          source_type: "image_url",
          url: image.url,
          is_standard: true,
        },
      }),
      // Rekam kuota X-RateLimit-* Pinterest (parser quota.ts sudah mendukung)
      onResponse: quotaHook("pinterest", input),
    });
    if (!res.ok) await throwFromResponse(res, "Pinterest pin");
    const data = await res.json();
    if (!data.id) throw new PublishError("pinterest_no_pin_id", "Pinterest tanpa pin ID", true);
    return {
      status: "published",
      platformPostId: data.id,
      platformPostUrl: `https://www.pinterest.com/pin/${data.id}/`,
    };
  }

  if (video) {
    // Video pin: register media → upload S3 → async poll
    const regRes = await httpRequest<{
      media_id?: string;
      upload_url?: string;
      upload_parameters?: Record<string, string>;
    }>(`${PINTEREST_BASE}/media`, {
      method: "POST",
      headers,
      body: JSON.stringify({ media_type: "video" }),
      onResponse: quotaHook("pinterest", input),
    });
    if (!regRes.ok) await throwFromResponse(regRes, "Pinterest media register");
    const reg = await regRes.json();
    if (!reg.media_id || !reg.upload_url) {
      throw new PublishError("pinterest_no_media", "Pinterest tidak mengembalikan media ID", true);
    }

    // Upload ke S3 Pinterest (multipart, TANPA Bearer auth — riset pinterest.md)
    const blob = await downloadMediaBlob(video.url);
    const form = new FormData();
    for (const [k, v] of Object.entries(reg.upload_parameters ?? {})) {
      form.append(k, v);
    }
    form.append("file", blob, "video.mp4");
    const uploadRes = await httpUpload(reg.upload_url, { method: "POST", body: form, retries: 1 });
    if (uploadRes.status !== 204) {
      throw new PublishError(
        `pinterest_upload_${uploadRes.status}`,
        `Upload video Pinterest gagal (${uploadRes.status})`,
        true,
      );
    }

    // Async: worker poll GET /media/{id} → lalu buat pin dengan cover
    return { status: "processing", handle: `pin:${reg.media_id}` };
  }

  throw new PublishError(
    "pinterest_requires_media",
    "Pinterest memerlukan gambar atau video.",
    false,
  );
}

/** Poll Pinterest video processing → buat pin final saat media ready */
async function checkPinterestStatus(input: {
  accessToken: string;
  platformAccountId: string;
  handle: string;
  content: string;
  hashtags: string[];
  platformSettings: Record<string, unknown>;
  media?: { url: string; type: string; thumbnailUrl?: string | null }[];
}): Promise<
  | { status: "processing" }
  | { status: "published"; platformPostId: string; platformPostUrl?: string | null }
  | { status: "failed"; code: string; message: string; retryable: boolean }
> {
  const mediaId = input.handle.replace("pin:", "");
  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
  };
  const res = await httpRequest<{ status?: string }>(`${PINTEREST_BASE}/media/${mediaId}`, {
    headers,
  });
  if (!res.ok) await throwFromResponse(res, "Pinterest media status");
  const { status } = await res.json();

  if (status === "succeeded") {
    // Media siap → create pin dengan video_id (cover_image_url WAJIB — riset).
    // Fallback: thumbnail video otomatis (generate client-side saat upload).
    const cover =
      (typeof input.platformSettings.coverImageUrl === "string"
        ? input.platformSettings.coverImageUrl
        : undefined) ??
      input.media?.find((m) => m.type === "video")?.thumbnailUrl ??
      undefined;
    if (!cover) {
      return {
        status: "failed",
        code: "pinterest_no_cover",
        message: "Video Pinterest memerlukan cover image URL.",
        retryable: false,
      };
    }
    const pinRes = await httpRequest<{ id?: string }>(`${PINTEREST_BASE}/pins`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        board_id: input.platformAccountId,
        title: String(input.platformSettings.title ?? input.content.slice(0, 100)).slice(0, 100),
        description: composeCaption(input.content, input.hashtags).slice(0, 800),
        // Field "Link tujuan pin" — sebelumnya hanya terkirim untuk image pin,
        // di-drop diam-diam pada video pin. Pinterest /pins mendukung `link`
        // untuk kedua jenis pin.
        link:
          typeof input.platformSettings.link === "string" && input.platformSettings.link.trim()
            ? input.platformSettings.link.trim().slice(0, 2048)
            : undefined,
        media_source: {
          source_type: "video_id",
          media_id: mediaId,
          cover_image_url: cover,
        },
      }),
    });
    if (!pinRes.ok) await throwFromResponse(pinRes, "Pinterest video pin");
    const pin = await pinRes.json();
    if (!pin.id) return { status: "processing" };
    return {
      status: "published",
      platformPostId: pin.id,
      platformPostUrl: `https://www.pinterest.com/pin/${pin.id}/`,
    };
  }
  if (status === "failed") {
    return {
      status: "failed",
      code: "pinterest_media_failed",
      message: "Proses video Pinterest gagal",
      retryable: false,
    };
  }
  return { status: "processing" };
}

export const pinterestAdapter: PlatformAdapter = {
  platform: "pinterest",
  publish: publishPinterest,
  async checkStatus({
    accessToken,
    platformAccountId,
    handle,
    content,
    hashtags,
    platformSettings,
    media,
  }) {
    const r = await checkPinterestStatus({
      accessToken,
      platformAccountId,
      handle,
      content: content ?? "",
      hashtags: hashtags ?? [],
      platformSettings: platformSettings ?? {},
      media,
    });
    if (r.status === "published")
      return {
        status: "published",
        platformPostId: r.platformPostId,
        platformPostUrl: r.platformPostUrl,
      };
    if (r.status === "failed")
      return { status: "failed", code: r.code, message: r.message, retryable: r.retryable };
    return { status: "processing" };
  },
};
