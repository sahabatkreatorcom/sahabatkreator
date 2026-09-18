// Adapter Google Business Profile — LocalPosts API (masih legacy v4; Google belum
// menyediakan pengganti v1 untuk localPosts/reviews).
// POST /v4/accounts/{accountId}/locations/{locationId}/localPosts
// platformAccountId = "accounts/{accountId}/locations/{locationId}"
// Riset: docs/social-platforms/google-business.md (Sep 2026)

import { GBP_API_URL } from "../config";
import { httpRequest, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";

async function publishGoogleBusiness(input: PublishInput): Promise<PublishResult> {
  // localPosts v4 butuh name lengkap "accounts/{a}/locations/{l}".
  // platformAccountId untuk GBP = "accounts/{accountId}" (belum ada pemilihan lokasi),
  // jadi tolak jelas alih-alih menembak URL yang salah.
  const location = input.platformAccountId;
  if (!location.startsWith("accounts/") || !location.includes("/locations/")) {
    throw new PublishError(
      "gbp_location_required",
      "Google Business butuh lokasi lengkap (accounts/{accountId}/locations/{locationId}) untuk publish.",
      false,
    );
  }
  const summary = composeCaption(input.content, input.hashtags);
  if (summary.length > 1500) {
    throw new PublishError(
      "gbp_text_limit",
      "Teks Google Business maksimal 1.500 karakter.",
      false,
    );
  }

  const scheduledAtRaw = input.platformSettings.scheduledAt;
  const scheduledAt =
    typeof scheduledAtRaw === "string" || typeof scheduledAtRaw === "number"
      ? new Date(scheduledAtRaw)
      : undefined;

  // LocalPosts media hanya mendukung PHOTO — tolak jelas bila ada video/audio
  // agar post tidak terkirim text-only tanpa media.
  if (input.media.length > 0 && !input.media.some((m) => m.type === "image")) {
    throw new PublishError(
      "gbp_video_unsupported",
      "Google Business hanya mendukung foto — lepas videonya atau pilih platform lain.",
      false,
    );
  }
  const photos = input.media.filter((m) => m.type === "image").slice(0, 10);

  const body: Record<string, unknown> = {
    languageCode: "id-ID",
    summary,
    topicType: String(input.platformSettings.topicType ?? "STANDARD"),
    ...(photos.length > 0
      ? { media: photos.map((p) => ({ mediaFormat: "PHOTO", sourceUrl: p.url })) }
      : {}),
    ...(scheduledAt && scheduledAt.getTime() > Date.now()
      ? { scheduledTime: scheduledAt.toISOString() }
      : {}),
  };

  const res = await httpRequest<{ name?: string }>(`${GBP_API_URL}/v4/${location}/localPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwFromResponse(res, "GBP localPost");
  const data = await res.json();
  if (!data.name) throw new PublishError("gbp_no_post_id", "GBP tanpa post name", true);
  return {
    status: "published",
    platformPostId: data.name,
    scheduledOnPlatform: Boolean(scheduledAt),
  };
}

export const googleBusinessAdapter: PlatformAdapter = {
  platform: "google_business",
  publish: publishGoogleBusiness,
};
