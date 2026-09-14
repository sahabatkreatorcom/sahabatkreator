// Adapter LinkedIn — Posts API versioned
// POST /rest/posts — 1-call utk teks; media via Images API (2-step)
// platformAccountId = URN owner ("urn:li:person:{sub}" atau "urn:li:organization:{id}")
// Riset: docs/social-platforms/linkedin.md (Sep 2026)

import { LINKEDIN_API_VERSION } from "../config";
import { downloadMediaBlob, httpRequest, httpUpload, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";
import { quotaHook } from "./meta-shared";

async function publishLinkedIn(input: PublishInput): Promise<PublishResult> {
  const owner = input.platformAccountId;
  const commentary = composeCaption(input.content, input.hashtags);
  if (commentary.length > 3000) {
    throw new PublishError("linkedin_text_limit", "Teks LinkedIn maksimal 3.000 karakter.", false);
  }

  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": LINKEDIN_API_VERSION, // sunset bulanan — env
    "X-Restli-Protocol-Version": "2.0.0",
  };

  const image = input.media.find((m) => m.type === "image");

  const body: Record<string, unknown> = {
    author: owner,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  if (image) {
    // Images API: initializeUpload → upload binary → post dengan media.id
    const initRes = await httpRequest<{ value?: { uploadUrl?: string; image?: string } }>(
      "https://api.linkedin.com/rest/images?action=initializeUpload",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          initializeUploadRequest: { owner },
        }),
        // Rekam kuota X-RateLimit-* LinkedIn (parser quota.ts sudah mendukung)
        onResponse: quotaHook("linkedin", input),
      },
    );
    if (!initRes.ok) await throwFromResponse(initRes, "LinkedIn image init");
    const init = (await initRes.json()).value;
    if (!init?.uploadUrl || !init.image) {
      throw new PublishError("linkedin_no_upload", "LinkedIn tidak mengembalikan upload URL", true);
    }

    // Download dari R2 (tervalidasi status) → upload ke LinkedIn
    const blob = await downloadMediaBlob(image.url);
    const uploadRes = await httpUpload(init.uploadUrl, { method: "PUT", body: blob });
    if (!uploadRes.ok) {
      throw new PublishError(
        `linkedin_upload_${uploadRes.status}`,
        `Upload gambar LinkedIn gagal (${uploadRes.status})`,
        uploadRes.status >= 500,
      );
    }

    body.content = { media: { id: init.image, altText: image.altText ?? undefined } };
  }

  const res = await httpRequest("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    onResponse: quotaHook("linkedin", input),
  });
  if (!res.ok) await throwFromResponse(res, "LinkedIn post");
  // Post ID di header x-restli-id (riset linkedin.md)
  const postId = res.headers.get("x-restli-id") ?? "";
  if (!postId)
    throw new PublishError("linkedin_no_post_id", "LinkedIn tidak mengembalikan post ID", true);
  return { status: "published", platformPostId: postId };
}

export const linkedinAdapter: PlatformAdapter = {
  platform: "linkedin",
  publish: publishLinkedIn,
};
