// Reply adapter — kirim balasan komentar/review/mention via API platform
// Dipakai route engagement POST /:id/reply.
//
// Cakupan (riset docs/social-platforms):
// - IG kedua jalur: POST /{media-id}/comments (manage_comments)
// - FB Page: POST /{comment-id}/comments (pages_manage_posts)
// - Threads: reply via container + reply_to_id (threads_manage_replies)
// - TikTok: POST /comment/reply/create/ (comment.list + comment.list.manage scope — moderasi terbatas API listing; reply perlu ID komentar dari webhook)
// - YouTube: POST /commentThreads + commentThreads.insert (youtube.force-ssl)
// - Bluesky: createRecord app.bsky.feed.post dengan reply root/parent
// - LinkedIn: socialActions/{postUrn}/comments
// - GBP: review reply via locations/{id}/reviews/{reviewId}/reply
// - Pinterest: tidak ada comment API publik → null (catat lokal saja)

import {
  BLUESKY_PDS_URL,
  GBP_API_URL,
  GRAPH_FB_URL,
  GRAPH_IG_URL,
  GRAPH_THREADS_URL,
  LINKEDIN_API_VERSION,
  LINKEDIN_REST_URL,
  TIKTOK_OPEN_API_URL,
  YOUTUBE_API_URL,
} from "./config";
import { httpRequest, throwFromResponse } from "./http";
import { PublishError } from "./types";

const GRAPH_FB = GRAPH_FB_URL;
const GRAPH_IG = GRAPH_IG_URL;
const GRAPH_THREADS = GRAPH_THREADS_URL;
const BSKY_PDS = BLUESKY_PDS_URL;

/** Konteks reply yang dibutuhkan adapter */
export type ReplyInput = {
  platform: string;
  /** Token plaintext (caller decrypt) */
  accessToken: string;
  /** platformItemId: ID komentar/post/review di platform */
  platformItemId: string | null;
  /** Parent ID (comment thread / reply root) bila ada */
  platformParentId?: string | null;
  /** Tipe item inbox (comment/mention/dm/review) — menentukan endpoint review */
  itemType?: string | null;
  /** Konten balasan */
  content: string;
  /** platformAccountId akun sosial */
  platformAccountId: string;
  /** metadata akun (mis. pageId, did, page access token) */
  accountMetadata?: Record<string, unknown> | null;
};

/** Hasil reply sukses */
export type ReplyResult = {
  /** ID reply di platform (untuk tracking) */
  replyId: string;
};

async function replyInstagram(input: ReplyInput): Promise<ReplyResult> {
  // platformItemId = media id IG; reply → POST /{media-id}/comments
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID media platform.", false);
  }
  // FB Login jalur pakai page access token bila ada (scope page)
  const token =
    (typeof input.accountMetadata?.pageAccessToken === "string"
      ? input.accountMetadata.pageAccessToken
      : null) ?? input.accessToken;
  const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${input.platformItemId}/comments`, {
    method: "POST",
    query: { message: input.content, access_token: token },
  });
  if (!res.ok) await throwFromResponse(res, "IG reply");
  const id = (await res.json()).id;
  if (!id) throw new PublishError("reply_no_id", "IG tidak mengembalikan comment ID", true);
  return { replyId: id };
}

async function replyInstagramStandalone(input: ReplyInput): Promise<ReplyResult> {
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID media platform.", false);
  }
  const res = await httpRequest<{ id?: string }>(`${GRAPH_IG}/${input.platformItemId}/comments`, {
    method: "POST",
    query: { message: input.content, access_token: input.accessToken },
  });
  if (!res.ok) await throwFromResponse(res, "IG standalone reply");
  const id = (await res.json()).id;
  if (!id) throw new PublishError("reply_no_id", "IG tidak mengembalikan comment ID", true);
  return { replyId: id };
}

async function replyFacebook(input: ReplyInput): Promise<ReplyResult> {
  const token =
    (typeof input.accountMetadata?.pageAccessToken === "string"
      ? input.accountMetadata.pageAccessToken
      : null) ?? input.accessToken;

  // Review Page (rating): balas via POST /{rating-id}/replies
  if (input.itemType === "review") {
    if (!input.platformItemId) {
      throw new PublishError("no_platform_item", "Item tidak punya ID review platform.", false);
    }
    const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${input.platformItemId}/replies`, {
      method: "POST",
      query: { message: input.content.slice(0, 2000), access_token: token },
    });
    if (!res.ok) await throwFromResponse(res, "FB review reply");
    const id = (await res.json()).id;
    if (!id) throw new PublishError("reply_no_id", "FB review reply tanpa ID", true);
    return { replyId: id };
  }

  // platformItemId = comment id FB → POST /{comment-id}/comments
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID komentar platform.", false);
  }
  const res = await httpRequest<{ id?: string }>(`${GRAPH_FB}/${input.platformItemId}/comments`, {
    method: "POST",
    query: { message: input.content, access_token: token },
  });
  if (!res.ok) await throwFromResponse(res, "FB reply");
  const id = (await res.json()).id;
  if (!id) throw new PublishError("reply_no_id", "FB tidak mengembalikan comment ID", true);
  return { replyId: id };
}

async function replyThreads(input: ReplyInput): Promise<ReplyResult> {
  // Reply Threads: container dengan reply_to_id = post yang dibalas
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID post Threads.", false);
  }
  const text = input.content.slice(0, 500); // limit 500 grapheme — konservatif
  const res = await httpRequest<{ id?: string }>(
    `${GRAPH_THREADS}/${input.platformAccountId}/threads`,
    {
      method: "POST",
      query: {
        media_type: "TEXT",
        text,
        reply_to_id: input.platformItemId,
        access_token: input.accessToken,
      },
    },
  );
  if (!res.ok) await throwFromResponse(res, "Threads reply");
  const containerId = (await res.json()).id;
  if (!containerId)
    throw new PublishError("threads_no_container", "Threads reply tanpa container ID", true);

  // Container harus FINISHED sebelum threads_publish (docs: rata-rata ±30 detik;
  // publish terlalu dini → ditolak platform). Poll inline — teks biasanya <5 detik.
  const deadline = Date.now() + 60_000;
  for (;;) {
    const st = await httpRequest<{ status?: string; error_message?: string }>(
      `${GRAPH_THREADS}/${containerId}`,
      { query: { fields: "status,error_message", access_token: input.accessToken } },
    );
    if (!st.ok) await throwFromResponse(st, "Threads reply container status");
    const { status, error_message } = await st.json();
    if (status === "FINISHED" || status === "PUBLISHED") break;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new PublishError(
        `threads_reply_${status.toLowerCase()}`,
        `Container reply Threads ${status}${error_message ? `: ${error_message}` : ""}`,
        false,
      );
    }
    if (Date.now() >= deadline) {
      throw new PublishError(
        "threads_reply_timeout",
        "Container reply Threads belum selesai diproses (timeout 60 detik).",
        true,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  // Publish final — error [24] "resource does not exist" terjadi bila post parent
  // baru saja terpublish dan belum terpropagasi di sisi Meta; retry singkat.
  const pubDeadline = Date.now() + 60_000;
  for (let attempt = 0; ; attempt++) {
    const pub = await httpRequest<{ id?: string }>(
      `${GRAPH_THREADS}/${input.platformAccountId}/threads_publish`,
      { method: "POST", query: { creation_id: containerId, access_token: input.accessToken } },
    );
    if (pub.ok) {
      const mediaId = (await pub.json()).id;
      if (!mediaId)
        throw new PublishError("threads_no_media_id", "Threads reply publish tanpa ID", true);
      return { replyId: mediaId };
    }
    // Body native Response hanya bisa dibaca sekali — baca sekarang, reuse utk throw
    const body = await pub.text();
    const propagating = pub.status === 404 || body.includes("[24]");
    if (!propagating || Date.now() >= pubDeadline || attempt >= 9) {
      await throwFromResponse(
        {
          ok: pub.ok,
          status: pub.status,
          headers: pub.headers,
          json: () => Promise.reject(new Error("body sudah dikonsumsi")),
          text: () => Promise.resolve(body),
        },
        "Threads reply publish",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 6_000));
  }
}

async function replyTikTok(input: ReplyInput): Promise<ReplyResult> {
  // POST /comment/reply/create/ — butuh comment_id dari webhook (item sinkron)
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID komentar TikTok.", false);
  }
  const res = await httpRequest<{
    data?: { comment_id?: string };
    error?: { code?: string; message?: string };
  }>(`${TIKTOK_OPEN_API_URL}/comment/reply/create/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      comment_id: input.platformItemId,
      text: input.content.slice(0, 150),
    }),
    retries: 1,
  });
  if (!res.ok) await throwFromResponse(res, "TikTok reply");
  const data = await res.json();
  if (data.error?.code && data.error.code !== "ok") {
    throw new PublishError(
      `tiktok_${data.error.code}`,
      `TikTok: ${data.error.message ?? data.error.code}`,
      false,
    );
  }
  if (!data.data?.comment_id) {
    throw new PublishError("tiktok_no_reply_id", "TikTok reply tanpa comment_id", true);
  }
  return { replyId: data.data.comment_id };
}

async function replyYouTube(input: ReplyInput): Promise<ReplyResult> {
  // First comment di video (platformItemId = video ID) → commentThreads.insert
  // (top-level comment). Reply komentar (platformItemId/parentId = comment ID)
  // → comments.insert dengan snippet.parentId.
  // NOTE: commentThreads.insert butuh channelId → platformAccountId akun
  // YouTube direct-OAuth = channelId.
  if (input.itemType === "first_comment") {
    if (!input.platformItemId) {
      throw new PublishError("no_platform_item", "Post YouTube tidak punya video ID.", false);
    }
    const res = await httpRequest<{ id?: string }>(`${YOUTUBE_API_URL}/commentThreads`, {
      method: "POST",
      query: { part: "snippet" },
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          channelId: input.platformAccountId,
          videoId: input.platformItemId,
          topLevelComment: {
            snippet: { textOriginal: input.content.slice(0, 10000) },
          },
        },
      }),
    });
    if (!res.ok) await throwFromResponse(res, "YouTube first comment");
    const id = (await res.json()).id;
    if (!id) throw new PublishError("yt_no_comment_id", "YouTube first comment tanpa ID", true);
    return { replyId: id };
  }

  // Reply ke komentar — comments.insert dengan parentId (comment ID)
  if (!input.platformItemId && !input.platformParentId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID komentar YouTube.", false);
  }
  const parentId = input.platformParentId ?? input.platformItemId!;
  const res = await httpRequest<{ id?: string }>(`${YOUTUBE_API_URL}/comments`, {
    method: "POST",
    query: { part: "snippet" },
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: {
        parentId,
        textOriginal: input.content.slice(0, 10000),
      },
    }),
  });
  if (!res.ok) await throwFromResponse(res, "YouTube reply");
  const id = (await res.json()).id;
  if (!id) throw new PublishError("yt_no_reply_id", "YouTube reply tanpa comment ID", true);
  return { replyId: id };
}

async function replyBluesky(input: ReplyInput): Promise<ReplyResult> {
  // Reply = createRecord dengan reply root/parent
  // accessToken = app password → createSession dulu (adapter publish pakai pola sama)
  let accessJwt = input.accessToken;
  if (!accessJwt.startsWith("eyJ")) {
    const sessionRes = await httpRequest<{ accessJwt?: string }>(
      `${BSKY_PDS}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: input.platformAccountId,
          password: input.accessToken,
        }),
        retries: 0,
      },
    );
    if (!sessionRes.ok) await throwFromResponse(sessionRes, "Bluesky session");
    const session = await sessionRes.json();
    if (!session.accessJwt)
      throw new PublishError("bluesky_no_jwt", "Session Bluesky tanpa accessJwt", false);
    accessJwt = session.accessJwt;
  }

  // platformItemId = at-uri post ("at://did:plc:.../app.bsky.feed.post/...")
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya URI post Bluesky.", false);
  }
  // Ambil cid parent post via getRecord (untuk strong ref)
  const uriParts = input.platformItemId.replace("at://", "").split("/");
  const repo = uriParts[0];
  const rkey = uriParts[uriParts.length - 1];
  const recRes = await httpRequest<{ uri?: string; cid?: string }>(
    `${BSKY_PDS}/xrpc/com.atproto.repo.getRecord`,
    { query: { repo, collection: "app.bsky.feed.post", rkey } },
  );
  if (!recRes.ok) await throwFromResponse(recRes, "Bluesky getRecord");
  const parent = await recRes.json();
  if (!parent.cid || !parent.uri) {
    throw new PublishError("bluesky_no_ref", "Tidak bisa resolve post parent Bluesky", false);
  }

  const res = await httpRequest<{ uri?: string }>(
    `${BSKY_PDS}/xrpc/com.atproto.repo.createRecord`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: input.platformAccountId,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text: input.content,
          createdAt: new Date().toISOString(),
          reply: {
            root: { uri: parent.uri, cid: parent.cid },
            parent: { uri: parent.uri, cid: parent.cid },
          },
        },
      }),
    },
  );
  if (!res.ok) await throwFromResponse(res, "Bluesky reply");
  const data = await res.json();
  if (!data.uri) throw new PublishError("bluesky_no_uri", "Reply Bluesky tanpa URI", true);
  return { replyId: data.uri };
}

async function replyLinkedIn(input: ReplyInput): Promise<ReplyResult> {
  // POST /rest/socialActions/{postUrn}/comments
  // LinkedIn Comments API: object di body harus pakai format urn:li:activity:{id}
  // Bila platformPostId masih bentuk urn:li:share:{id}, konversi ke urn:li:activity:{id}
  const rawUrn = input.platformItemId;
  if (!rawUrn) {
    throw new PublishError("linkedin_no_urn", "Item LinkedIn tidak punya URN post.", false);
  }

  // Ekstrak ID dari share URN → activity URN
  // urn:li:share:123456 → urn:li:activity:123456
  // urn:li:activity:123456 → tetap
  // urn:li:ugcPost:123456 → tetap (ugcPost juga valid)
  let postUrn = rawUrn;
  let objectUrn = rawUrn;
  if (rawUrn.startsWith("urn:li:share:")) {
    const id = rawUrn.replace("urn:li:share:", "");
    postUrn = rawUrn;
    objectUrn = `urn:li:activity:${id}`;
  } else if (rawUrn.startsWith("urn:li:")) {
    postUrn = rawUrn;
    objectUrn = rawUrn;
  } else {
    throw new PublishError("linkedin_no_urn", "Item LinkedIn tidak punya URN post.", false);
  }

  const version = LINKEDIN_API_VERSION;
  const res = await httpRequest(
    `${LINKEDIN_REST_URL}/rest/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": version,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        actor: input.platformAccountId.startsWith("urn:li:")
          ? input.platformAccountId
          : `urn:li:person:${input.platformAccountId}`,
        object: objectUrn,
        message: { text: input.content.slice(0, 1250) },
      }),
    },
  );
  // LinkedIn 201 tanpa body → cek status saja
  if (!res.ok) await throwFromResponse(res, "LinkedIn reply");
  return { replyId: res.headers.get("x-restli-id") ?? postUrn };
}

async function replyGoogleBusiness(input: ReplyInput): Promise<ReplyResult> {
  // Review reply: PUT locations/{location}/reviews/{reviewId}/reply
  // platformItemId = "locations/{loc}/reviews/{reviewId}"
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Item tidak punya ID review Google.", false);
  }
  const res = await httpRequest(`${GBP_API_URL}/v4/${input.platformItemId}/reply`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      comment: input.content.slice(0, 4096),
    }),
  });
  if (!res.ok) await throwFromResponse(res, "GBP review reply");
  return { replyId: input.platformItemId };
}

/** Dispatch reply ke adapter platform. Throw PublishError bila gagal. */
export async function sendReply(input: ReplyInput): Promise<ReplyResult> {
  switch (input.platform) {
    case "instagram":
      return replyInstagram(input);
    case "instagram_standalone":
      return replyInstagramStandalone(input);
    case "facebook":
      return replyFacebook(input);
    case "threads":
      return replyThreads(input);
    case "tiktok":
      return replyTikTok(input);
    case "youtube":
      return replyYouTube(input);
    case "bluesky":
      return replyBluesky(input);
    case "linkedin":
    case "linkedin_org":
      // linkedin_org = post atas nama company; komentar pakai Comments API yang sama
      return replyLinkedIn(input);
    case "google_business":
      return replyGoogleBusiness(input);
    default:
      // Pinterest (tanpa API komentar publik) & platform tak dikenal → catat lokal saja
      throw new PublishError(
        "reply_not_supported",
        `Reply via API untuk ${input.platform} tidak didukung. Balasan hanya dicatat lokal.`,
        false,
      );
  }
}
