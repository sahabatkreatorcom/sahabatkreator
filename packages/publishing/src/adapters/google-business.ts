// Adapter Google Business Profile — LocalPosts API
// POST localPosts — 1-call + native scheduledTime
// platformAccountId = "accounts/{accountId}/locations/{locationId}"
// Riset: docs/social-platforms/google-business.md (Sep 2026)

import { httpRequest, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";

async function publishGoogleBusiness(input: PublishInput): Promise<PublishResult> {
  const location = input.platformAccountId.startsWith("locations/")
    ? input.platformAccountId
    : `locations/${input.platformAccountId}`;
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

  const res = await httpRequest<{ name?: string }>(
    `https://mybusiness.googleapis.com/v4/${location}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
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
