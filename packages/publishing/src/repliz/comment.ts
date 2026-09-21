// Comment API (Standard+) — antrian moderasi komentar.
// Docs: docs/repliz/Comment/

import { replizEmpty, replizMissingId, replizRequest, type ReplizCredentials } from "./shared";

/** Orang/platform yang memiliki sebuah post atau komentar */
export type ReplizCommentOwner = {
  id?: string;
  name?: string;
  picture?: string;
};

export type ReplizCommentMedia = { url?: string; type?: string };

/** Satu doc komentar di antrian Repliz (GET /public/comment) */
export type ReplizCommentDoc = {
  _id: string;
  id?: string;
  status?: string;
  accountId?: string;
  createdAt?: string;
  /** Post yang dikomentari — konteks saja */
  content?: {
    id?: string;
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    owner?: ReplizCommentOwner;
    medias?: ReplizCommentMedia[];
    createdAt?: string;
  };
  /** Komentar itu sendiri — sumber text & author */
  comment?: {
    id?: string;
    type?: string;
    text?: string;
    owner?: ReplizCommentOwner;
    medias?: ReplizCommentMedia[];
    createdAt?: string;
    hasReplies?: boolean;
  };
};

/** Status moderasi komentar di antrian Repliz. */
export type ReplizCommentStatus = "pending" | "resolved" | "ignored";

/**
 * List komentar di antrian Repliz (GET /public/comment).
 * status: "pending" (baru/belum dibalas) | "resolved" | "ignored".
 *
 * Penting: filter account WAJIB pakai notasi array `accountIds[]`. Bentuk
 * `accountIds=` (tanpa bracket) DIABAIKAN API — diverifikasi live: ia
 * mengembalikan seluruh comment workspace, sehingga komentar akun bridge A
 * bocor ke inbox akun bridge B. Dengan bracket, filter ditegakkan (0 doc
 * untuk akun yang tak punya comment).
 */
export async function replizListComments(
  cred: ReplizCredentials,
  accountId: string,
  opts: { page?: number; limit?: number; status?: ReplizCommentStatus } = {},
): Promise<{ docs: ReplizCommentDoc[]; total?: number }> {
  const query: Record<string, string> = {
    page: String(opts.page ?? 1),
    limit: String(opts.limit ?? 20),
    status: opts.status ?? "pending",
    // URLSearchParams meng-encode [] → %5B%5D (juga diterima API, tetap filter)
    "accountIds[]": accountId,
  };
  return replizRequest(cred, "/public/comment", { query });
}

/** Ambil satu comment by id (GET /public/comment/{commentId}). */
export async function replizGetComment(
  cred: ReplizCredentials,
  commentId: string,
): Promise<ReplizCommentDoc | null> {
  const data = await replizRequest<Record<string, unknown>>(cred, `/public/comment/${commentId}`);
  if (!data || (!data.id && !data._id)) return null;
  return {
    _id: String(data._id ?? data.id),
    id: data.id ? String(data.id) : undefined,
    comment: data.comment as ReplizCommentDoc["comment"],
    status: data.status as ReplizCommentStatus,
  };
}

/**
 * Balas komentar yang tersimpan di Repliz — reply dikirim ke platform asli.
 * POST /public/comment/{commentId} body { text } → { commentId }
 * commentId = _id komentar Repliz (disimpan di engagement_item.platform_item_id).
 */
export async function replizReplyComment(
  cred: ReplizCredentials,
  commentId: string,
  text: string,
): Promise<string> {
  const data = await replizRequest<{ commentId?: string }>(cred, `/public/comment/${commentId}`, {
    method: "POST",
    body: { text },
  });
  if (!data?.commentId) {
    throw replizMissingId("repliz_reply_no_id", "Repliz tidak mengembalikan commentId reply.", true);
  }
  return data.commentId;
}

/** Hapus komentar dari workspace Repliz (DELETE /public/comment/{commentId}, 204) */
export async function replizDeleteComment(
  cred: ReplizCredentials,
  commentId: string,
): Promise<void> {
  await replizEmpty(cred, `/public/comment/${commentId}`, { method: "DELETE" });
}

/**
 * Update status moderasi comment (PUT /public/comment/{id}/status, 204).
 * Pakai untuk mark resolved/ignored — workflow inbox.
 */
export async function replizUpdateCommentStatus(
  cred: ReplizCredentials,
  commentId: string,
  status: ReplizCommentStatus,
): Promise<void> {
  await replizEmpty(cred, `/public/comment/${commentId}/status`, { method: "PUT", body: { status } });
}
