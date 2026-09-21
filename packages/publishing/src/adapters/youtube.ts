// Adapter YouTube — Data API v3 videos.insert resumable upload
// Download media dari R2 lalu PUT per-chunk ke session URI (resumable).
// Riset: docs/social-platforms/youtube.md (Sep 2026)

import { downloadMedia, httpRequest, parseRetryAfterMs, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";

/** Ukuran chunk upload — multiple 256 KB (syarat YouTube), ~8 MB. */
const CHUNK_SIZE = 8 * 1024 * 1024;
/** Timeout per-chunk — 8 MB pada koneksi lambat (~1 Mbps) bisa > 60 dtk. */
const CHUNK_TIMEOUT_MS = 5 * 60_000;
/** Timeout download video besar dari R2. */
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
/** Max retry per-chunk dengan backoff eksponensial (rekomendasi Google ~10). */
const MAX_CHUNK_ATTEMPTS = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Respons akhir videos.insert saat upload sukses. */
type VideoInsertResponse = { id?: string };

/**
 * PUT satu chunk ke session URI.
 * - 308 = Resume Incomplete (chunk diterima, lanjut chunk berikutnya)
 * - 2xx = upload selesai (video terpublish) — return body JSON
 * - 429/5xx/network = transien → retry dengan backoff (hormati Retry-After)
 * - 4xx lain = fatal (sesi kedaluwarsa, token invalid, dsb.)
 */
async function putChunk(
  uploadUrl: string,
  headers: Record<string, string>,
  body: ArrayBuffer,
): Promise<{ status: number; range: string | null; json?: VideoInsertResponse }> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body,
        signal: AbortSignal.timeout(CHUNK_TIMEOUT_MS),
      });

      if (res.status === 308) {
        // 308 Resume Incomplete — header Range menunjukkan byte terakhir yang
        // diterima server, mis. "bytes=0-8388607"
        return { status: 308, range: res.headers.get("range") };
      }
      if (res.ok) {
        return { status: res.status, range: null, json: (await res.json()) as VideoInsertResponse };
      }
      // Transien → backoff lalu retry chunk yang sama
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        if (attempt >= MAX_CHUNK_ATTEMPTS) {
          const text = await res.text().catch(() => "");
          throw new PublishError(
            `yt_upload_${res.status}`,
            `Upload YouTube gagal setelah ${attempt} percobaan: ${text.slice(0, 300)}`,
            true,
          );
        }
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        await sleep(Math.min(retryAfterMs ?? 1000 * 2 ** attempt + Math.random() * 500, 30_000));
        continue;
      }
      // 4xx fatal (400 invalid metadata/sesi, 401 token, 403 quota/policy, 410 sesi hilang)
      const text = await res.text().catch(() => "");
      throw new PublishError(
        `yt_upload_${res.status}`,
        `Upload YouTube ditolak: ${text.slice(0, 300)}`,
        false,
      );
    } catch (error) {
      if (error instanceof PublishError) throw error;
      // Network error / timeout — bisa dilanjutkan (resume), jangan ulang dari nol
      if (attempt >= MAX_CHUNK_ATTEMPTS) {
        throw new PublishError(
          "yt_upload_network",
          `Upload YouTube gagal (jaringan): ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
    }
  }
}

/**
 * Query posisi byte terakhir yang diterima server via PUT Content-Range
 * "bytes STAR/TOTAL" (chunk kosong). Dipakai saat resume setelah kegagalan —
 * mengembalikan offset awal untuk chunk berikutnya.
 */
async function queryUploadedOffset(uploadUrl: string, total: number): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes */${total}` },
        signal: AbortSignal.timeout(30_000),
      });
      // 308 + Range: bytes=0-N → server punya byte 0..N, lanjut dari N+1
      const range = res.headers.get("range");
      if (res.status === 308 && range) {
        const match = /bytes=0-(\d+)/.exec(range);
        if (match) return Number(match[1]) + 1;
        return 0;
      }
      if (res.ok) {
        // Upload ternyata sudah selesai (server balas 2xx) — sinyalkan via offset penuh
        return total;
      }
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        if (attempt >= MAX_CHUNK_ATTEMPTS) {
          throw new PublishError("yt_upload_status", "Gagal query status upload YouTube", true);
        }
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        await sleep(Math.min(retryAfterMs ?? 1000 * 2 ** attempt, 30_000));
        continue;
      }
      throw new PublishError(
        `yt_upload_status_${res.status}`,
        `Session upload YouTube tidak valid (${res.status})`,
        res.status >= 500,
      );
    } catch (error) {
      if (error instanceof PublishError) throw error;
      if (attempt >= MAX_CHUNK_ATTEMPTS) {
        throw new PublishError(
          "yt_upload_status",
          `Gagal query status upload: ${error instanceof Error ? error.message : String(error)}`,
          true,
        );
      }
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
    }
  }
}

/**
 * Upload video per-chunk ke resumable session URI YouTube.
 * Setelah kegagalan intermiten, query offset dari server lalu lanjut dari
 * posisi terakhir (tidak mengulang dari byte 0).
 */
async function uploadVideoResumable(
  uploadUrl: string,
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<VideoInsertResponse> {
  const total = bytes.byteLength;
  const contentType = mimeType || "video/mp4";
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total) - 1;
    const chunk = bytes.slice(offset, end + 1);

    const result = await putChunk(
      uploadUrl,
      {
        "Content-Type": contentType,
        "Content-Range": `bytes ${offset}-${end}/${total}`,
      },
      chunk,
    );

    if (result.json) {
      // 2xx — upload selesai, body berisi resource video
      return result.json;
    }
    // 308 — server konfirmasi menerima `Range`, atau balas tanpa Range
    // (chunk terakhir sebelum final). Lanjut dari end+1.
    if (result.range) {
      const match = /bytes=0-(\d+)/.exec(result.range);
      if (match) {
        offset = Number(match[1]) + 1;
        continue;
      }
    }
    offset = end + 1;
  }

  // Semua byte terkirim tapi belum ada respons 2xx — query status final
  const finalOffset = await queryUploadedOffset(uploadUrl, total);
  if (finalOffset >= total) {
    // Server sudah punya semua byte; minta respons final dengan chunk kosong
    const result = await putChunk(
      uploadUrl,
      { "Content-Type": contentType, "Content-Range": `bytes */${total}` },
      new ArrayBuffer(0),
    );
    if (result.json) return result.json;
    throw new PublishError(
      "yt_upload_incomplete",
      `Upload YouTube belum selesai di server (status ${result.status})`,
      true,
    );
  }
  throw new PublishError(
    "yt_upload_incomplete",
    `Upload YouTube terhenti di byte ${finalOffset}/${total}`,
    true,
  );
}

async function publishYouTube(input: PublishInput): Promise<PublishResult> {
  const videos = input.media.filter((m) => m.type === "video");
  if (videos.length === 0) {
    throw new PublishError("youtube_requires_video", "YouTube memerlukan minimal 1 video.", false);
  }
  const video = videos[0]!;
  const title = String(input.platformSettings.title ?? input.content.slice(0, 100) ?? "Untitled");
  const description = composeCaption(input.content, input.hashtags);
  const tags = input.hashtags.map((h) => h.replace(/^#/, ""));

  // Scheduling native: privacyStatus private + publishAt → YT flip otomatis
  const publishAtRaw = input.platformSettings.publishAt ?? input.platformSettings.scheduledAt;
  const publishAt =
    typeof publishAtRaw === "string" || typeof publishAtRaw === "number"
      ? new Date(publishAtRaw)
      : undefined;
  const scheduled = publishAt && publishAt.getTime() > Date.now();
  const privacyStatus = scheduled
    ? "private"
    : String(input.platformSettings.privacyStatus ?? "public");

  // 1. Init resumable session
  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description,
      tags: tags.slice(0, 30),
      categoryId: String(input.platformSettings.categoryId ?? "22"), // 22 = People & Blogs
    },
    status: {
      privacyStatus,
      ...(scheduled ? { publishAt: publishAt!.toISOString() } : {}),
      selfDeclaredMadeForKids: input.platformSettings.madeForKids === true,
      embeddable: true,
      // Label konten sintetis/AI (riset: containsSyntheticMedia)
      containsSyntheticMedia: input.platformSettings.containsSyntheticMedia === true,
    },
  };

  // Download dulu agar ukuran total (X-Upload-Content-Length) diketahui saat init
  const bytes = await downloadMedia(video.url, DOWNLOAD_TIMEOUT_MS);

  const initRes = await httpRequest("https://www.googleapis.com/upload/youtube/v3/videos", {
    method: "POST",
    query: {
      uploadType: "resumable",
      part: "snippet,status",
      notifySubscribers: input.platformSettings.notifySubscribers !== false ? "true" : "false",
    },
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": video.mimeType || "video/mp4",
      "X-Upload-Content-Length": String(bytes.byteLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) await throwFromResponse(initRes, "YouTube upload init");
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    throw new PublishError("yt_no_session", "YouTube tidak mengembalikan upload session URL", true);
  }

  // 2. Upload per-chunk (resume dari offset server bila ada kegagalan intermiten)
  const result = await uploadVideoResumable(uploadUrl, bytes, video.mimeType || "video/mp4");
  if (!result.id) {
    throw new PublishError("yt_no_video_id", "YouTube tidak mengembalikan video ID", true);
  }
  return {
    status: "published",
    platformPostId: result.id,
    platformPostUrl: `https://www.youtube.com/watch?v=${result.id}`,
    scheduledOnPlatform: Boolean(scheduled),
  };
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube",
  publish: publishYouTube,
};
