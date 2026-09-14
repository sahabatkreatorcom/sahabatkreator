// Adapter Bluesky — AT Protocol XRPC (createRecord app.bsky.feed.post)
// Session dipersist caller (accessJwt di accessToken, did di platformAccountId).
// Login rate limit ketat (createSession 300/hari) → worker harus resume, bukan re-login.
// Riset: docs/social-platforms/bluesky.md (Sep 2026)

import { BLUESKY_PDS_URL as BSKY_PDS } from "../config";
import { downloadMedia, httpRequest, httpUpload, throwFromResponse } from "../http";
import {
  composeCaption,
  type PlatformAdapter,
  PublishError,
  type PublishInput,
  type PublishResult,
} from "../types";

async function publishBluesky(input: PublishInput): Promise<PublishResult> {
  const caption = composeCaption(input.content, input.hashtags);
  // Limit 300 grapheme (riset: pakai Intl.Segmenter utk hitung grapheme)
  const graphemes = [...new Intl.Segmenter("id", { granularity: "grapheme" }).segment(caption)];
  if (graphemes.length > 300) {
    throw new PublishError("bluesky_text_limit", "Teks Bluesky maksimal 300 grapheme.", false);
  }

  // accessToken = accessJwt; bila token adalah app password (bukan JWT), buat session dulu
  let accessJwt = input.accessToken;
  if (!input.accessToken.startsWith("eyJ")) {
    const sessionRes = await httpRequest<{ accessJwt?: string }>(
      `${BSKY_PDS}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: input.platformAccountId,
          password: input.accessToken,
        }),
        retries: 0, // rate limit 300/hari — jangan retry otomatis
      },
    );
    if (!sessionRes.ok) await throwFromResponse(sessionRes, "Bluesky session");
    const session = await sessionRes.json();
    if (!session.accessJwt)
      throw new PublishError("bluesky_no_jwt", "Bluesky session tanpa accessJwt", false);
    accessJwt = session.accessJwt;
  }

  // DID user (platformAccountId sudah berupa did:plc:...)
  const did = input.platformAccountId;

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text: caption,
    createdAt: new Date().toISOString(),
    langs: ["id"],
  };

  // Embed image (maks 4) via uploadBlob — video via video service di luar scope v1
  const images = input.media.filter((m) => m.type === "image").slice(0, 4);
  if (images.length > 0) {
    const embedImages: { alt: string; image: Record<string, unknown> }[] = [];
    for (const img of images) {
      const blobBytes = await downloadMedia(img.url);
      const blobRes = await httpUpload(`${BSKY_PDS}/xrpc/com.atproto.repo.uploadBlob`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessJwt}`,
          "Content-Type": img.mimeType || "image/jpeg",
        },
        body: blobBytes,
      });
      if (!blobRes.ok) {
        const text = await blobRes.text().catch(() => "");
        throw new PublishError(
          "bluesky_blob_failed",
          `Upload blob gagal: ${text.slice(0, 200)}`,
          true,
        );
      }
      const blob = (await blobRes.json()) as { blob?: Record<string, unknown> };
      if (!blob.blob) throw new PublishError("bluesky_no_blob", "Blob reference kosong", true);
      embedImages.push({ alt: img.altText ?? "", image: blob.blob });
    }
    record.embed = { $type: "app.bsky.embed.images", images: embedImages };
  }

  const res = await httpRequest<{ uri?: string; cid?: string }>(
    `${BSKY_PDS}/xrpc/com.atproto.repo.createRecord`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    },
  );
  if (!res.ok) await throwFromResponse(res, "Bluesky createRecord");
  const data = await res.json();
  if (!data.uri) throw new PublishError("bluesky_no_uri", "Bluesky tidak mengembalikan URI", true);
  // Web URL: at://did:plc:xxx/app.bsky.feed.post/rkey → bsky.app/profile/{did}/post/{rkey}
  const rkey = data.uri.split("/").pop();
  return {
    status: "published",
    platformPostId: data.uri,
    platformPostUrl: rkey ? `https://bsky.app/profile/${did}/post/${rkey}` : null,
  };
}

export const blueskyAdapter: PlatformAdapter = {
  platform: "bluesky",
  publish: publishBluesky,
};
