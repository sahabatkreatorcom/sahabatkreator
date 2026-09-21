// Content API (Gold+) — post terpublish, statistik, moderasi komentar per post.
// Docs: docs/repliz/Content/

import { replizEmpty, replizMissingId, replizRequest, type ReplizCredentials } from "./shared";
import type { ReplizCommentDoc, ReplizCommentStatus } from "./comment";

/** Konten terpublish di akun Repliz (GET /public/content) */
export type ReplizContent = {
  id: string;
  title?: string;
  description?: string;
  topic?: string;
  type: string; // text | image | video | reel | album | link | story
  owner?: { id: string; name?: string; picture?: string };
  medias?: Array<{ type: string; thumbnail?: string; url: string }>;
  url?: string;
  createdAt?: string;
  /** Statistik ringkas (mis. { comment: 3 }) — ada di response list content */
  statistic?: Record<string, number>;
};

/**
 * List konten terpublish akun bridge (paginasi cursor nextToken).
 * type "media" = post/reel/video; "story" = story (expiring).
 */
export async function replizListContent(
  cred: ReplizCredentials,
  accountId: string,
  opts: { nextToken?: string; type?: "media" | "story" } = {},
): Promise<{ docs: ReplizContent[]; nextToken?: string }> {
  const query: Record<string, string> = { accountId };
  if (opts.nextToken) query.nextToken = opts.nextToken;
  if (opts.type) query.type = opts.type;
  return replizRequest(cred, "/public/content", { query });
}

/**
 * Detail satu konten by id (GET /public/content/{contentId}?accountId=…).
 * Sumber otoritatif permalink (field `url`) untuk post yang terbit via Schedule
 * API — response Schedule hanya berisi postId, tidak ada URL. Sebelumnya
 * pipeline memindai halaman pertama GET /public/content untuk mencari id,
 * yang rapuh: post di luar halaman pertama tidak ketemu → URL tetap null.
 */
export async function replizGetContent(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
): Promise<ReplizContent | null> {
  const data = await replizRequest<Record<string, unknown>>(cred, `/public/content/${contentId}`, {
    query: { accountId },
  });
  if (!data || (!data.id && !data._id)) return null;
  return {
    id: String(data.id ?? data._id),
    title: data.title ? String(data.title) : undefined,
    description: data.description ? String(data.description) : undefined,
    topic: data.topic ? String(data.topic) : undefined,
    type: String(data.type ?? ""),
    owner: data.owner as ReplizContent["owner"],
    medias: data.medias as ReplizContent["medias"],
    url: data.url ? String(data.url) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    statistic: data.statistic as Record<string, number> | undefined,
  };
}

/**
 * Statistik engagement satu konten (GET /public/content/{contentId}/statistic).
 * Field yang dikembalikan bervariasi per platform (mis. FB: like/comment/share;
 * IG: + reach/saved/views/interaction; Threads: replies/repost/quotes; dll).
 */
export type ReplizContentStatistic = {
  like?: number;
  dislike?: number;
  comment?: number;
  share?: number;
  reach?: number;
  saved?: number;
  views?: number;
  watched?: number;
  interaction?: number;
  replies?: number;
  repost?: number;
  quotes?: number;
  favourite?: number;
  newFollower?: number;
  impression?: number;
  bookmark?: number;
  retweet?: number;
};

export async function replizGetContentStatistic(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
): Promise<ReplizContentStatistic> {
  return replizRequest(cred, `/public/content/${contentId}/statistic`, { query: { accountId } });
}

/**
 * Komentari sebuah konten/post yang sudah terbit di akun bridge.
 * POST /public/content/{contentId}/comment body { accountId, text } → { commentId }
 * (docs Repliz "Create Comment", tier Gold+). Dipakai untuk first comment pada
 * post yang dipublikasikan via Schedule API bridge — contentId = platformPostId
 * post tersebut (id konten Repliz).
 */
export async function replizCreateComment(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
  text: string,
): Promise<string> {
  const data = await replizRequest<{ commentId?: string }>(
    cred,
    `/public/content/${contentId}/comment`,
    { method: "POST", body: { accountId, text } },
  );
  if (!data?.commentId) {
    throw replizMissingId("repliz_comment_no_id", "Repliz tidak mengembalikan commentId.", true);
  }
  return data.commentId;
}

/** List comment di satu konten (GET /public/content/{id}/comment, Gold+). */
export async function replizListContentComments(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
  nextToken?: string,
): Promise<{ comments: ReplizCommentDoc[]; nextToken?: string }> {
  const data = await replizRequest<{
    docs?: Array<Record<string, unknown>>;
    nextToken?: string;
  }>(cred, `/public/content/${contentId}/comment`, {
    query: { accountId, nextToken },
  });
  return {
    comments: (data?.docs ?? []).map((d) => ({
      _id: String(d._id ?? d.id),
      id: d.id ? String(d.id) : undefined,
      comment: d.comment as ReplizCommentDoc["comment"],
      status: d.status as ReplizCommentStatus,
    })),
    nextToken: data?.nextToken,
  };
}

/**
 * Like/reaction ke comment (POST /public/content/{id}/like/{commentId}, 204).
 * Hanya Facebook, TikTok, LinkedIn — gate di UI via supportsReplizLike().
 */
export async function replizLikeComment(
  cred: ReplizCredentials,
  contentId: string,
  commentId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/content/${contentId}/like/${commentId}`, {
    method: "POST",
    body: {},
  });
}

/**
 * Balas comment via Content API (POST /public/content/{id}/message, Gold+).
 * Berbeda dgn POST /public/comment/{id}: ini kirim balasan langsung ke thread
 * platform. Hanya Facebook & Instagram.
 */
export async function replizMessageComment(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
  text: string,
): Promise<string | null> {
  const data = await replizRequest<{ messageId?: string }>(cred, `/public/content/${contentId}/message`, {
    method: "POST",
    body: { accountId, text },
  });
  return data?.messageId ?? null;
}

/** Hapus comment di konten (DELETE /public/content/{id}/comment/{commentId}, 204). */
export async function replizDeleteContentComment(
  cred: ReplizCredentials,
  contentId: string,
  commentId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/content/${contentId}/comment/${commentId}`, { method: "DELETE" });
}

/** Hapus post terpublish (DELETE /public/content/{id}, Gold+, 204). */
export async function replizDeleteContent(
  cred: ReplizCredentials,
  contentId: string,
  accountId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/content/${contentId}`, { method: "DELETE", query: { accountId } });
}
