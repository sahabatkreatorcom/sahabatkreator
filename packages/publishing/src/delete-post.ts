// Hapus post yang SUDAH tayang di platform (native, bukan lewat bridge Repliz).
//
// Kenapa dipisah dari pipeline/reply: hapus post adalah tindakan PERMANEN di
// sisi platform dan tidak bisa di-undo. Karena itu setiap platform punya
// konsekuensi berbeda dan harus dinyatakan eksplisit di sini, bukan disamarkan
// sebagai "berhasil" ketika platform sebenarnya menolak.
//
// Dukungan per platform (per riset docs/social-platforms + scope yang diminta
// di oauth/platform-configs.ts):
// - threads  : DELETE /{threads-media-id}          → scope threads_delete
// - tiktok   : POST /video/delete/                 → scope video.delete
// - bluesky  : com.atproto.repo.deleteRecord       → selalu bisa (data kita)
// - instagram/instagram_standalone : tidak tersedia. Graph API tidak punya
//              endpoint hapus media untuk IG (Comment API hanya komentar).
//              Media harus dihapus manual dari aplikasi Instagram.
// - facebook : tidak tersedia lewat Graph API Page (hanya DELETE
//              /{post-id} untuk Page post — TIDAK dipakai di sini karena
//              berisiko tinggi dan belum diuji; lihat catatan di bawah).
// - youtube  : tersedia (videos.delete) tetapi memakai kuota besar dan belum
//              diuji; sengaja tidak diaktifkan dulu.
// - linkedin/pinterest/google_business : tidak didukung.

import { BLUESKY_PDS_URL, GRAPH_FB_URL, GRAPH_THREADS_URL, TIKTOK_OPEN_API_URL } from "./config";
import { httpRequest, throwFromResponse } from "./http";
import { PublishError } from "./types";

export type DeletePublishedPostInput = {
  platform: string;
  /** ID post di platform (post.platformPostId) */
  platformPostId: string;
  accessToken: string;
  /** `platformAccountId` akun — dipakai Bluesky (DID pemilik repo). */
  platformAccountId?: string | null;
  accountMetadata?: Record<string, unknown> | null;
};

/**
 * Platform yang tombol "Hapus" di grid /post-results boleh ditampilkan.
 *
 * Dipakai juga oleh frontend lewat field `canDelete` dari API supaya daftar
 * ini punya SATU sumber kebenaran — jangan duplikasi di komponen React,
 * karena kalau tidak sinkron tombolnya muncul tapi gagal saat diklik.
 */
export const DELETABLE_PLATFORMS: readonly string[] = [
  "threads",
  "tiktok",
  "bluesky",
  "facebook",
] as const;

export function canDeletePublishedPost(platform: string): boolean {
  return DELETABLE_PLATFORMS.includes(platform);
}

/** Hapus post yang sudah tayang. Throw PublishError bila platform tidak didukung. */
export async function deletePublishedPost(input: DeletePublishedPostInput): Promise<void> {
  if (!input.platformPostId) {
    throw new PublishError("no_platform_item", "Post tidak punya ID platform.", false);
  }
  switch (input.platform) {
    case "threads":
      return deleteThreads(input);
    case "tiktok":
      return deleteTikTok(input);
    case "bluesky":
      return deleteBluesky(input);
    case "facebook":
      return deleteFacebook(input);
    default:
      throw new PublishError(
        "delete_unsupported",
        `Hapus post belum didukung untuk ${input.platform}. Hapus manual di aplikasi platformnya.`,
        false,
      );
  }
}

/** Threads: DELETE /{threads-media-id}?access_token=… (scope threads_delete). */
async function deleteThreads(input: DeletePublishedPostInput): Promise<void> {
  const res = await httpRequest(`${GRAPH_THREADS_URL}/${input.platformPostId}`, {
    method: "DELETE",
    query: { access_token: input.accessToken },
    retries: 0,
  });
  if (!res.ok) await throwFromResponse(res, "Hapus post Threads");
}

/**
 * TikTok: POST /video/delete/ dengan body {video_id} (scope video.delete).
 * Berbeda dari platform lain, TikTok memakai POST — bukan DELETE.
 */
async function deleteTikTok(input: DeletePublishedPostInput): Promise<void> {
  const res = await httpRequest(`${TIKTOK_OPEN_API_URL}/video/delete/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ video_id: input.platformPostId }),
    retries: 0,
  });
  if (!res.ok) await throwFromResponse(res, "Hapus video TikTok");
  // TikTok selalu membalas 200; kegagalan sesungguhnya ada di body.error.code.
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  const code = body?.error?.code;
  if (code && code !== "ok") {
    throw new PublishError(
      "delete_failed",
      `TikTok menolak hapus video: ${body?.error?.message ?? code}`,
      false,
    );
  }
}

/**
 * Bluesky: com.atproto.repo.deleteRecord dengan rkey dari URI post.
 * Post milik kita sendiri, jadi selalu boleh dihapus.
 */
async function deleteBluesky(input: DeletePublishedPostInput): Promise<void> {
  const parts = input.platformPostId.split("/");
  const rkey = parts[parts.length - 1];
  const collection = parts[parts.length - 2] ?? "app.bsky.feed.post";
  // DID pemilik repo: akun Bluesky menyimpannya di `platformAccountId`
  // (lihat oauth/bluesky.ts), bukan di metadata.
  const did = input.platformAccountId ?? input.accountMetadata?.did;
  if (!rkey || typeof did !== "string" || !did) {
    throw new PublishError(
      "delete_no_id",
      "Post Bluesky tidak punya rkey/did yang bisa dipakai untuk menghapus.",
      false,
    );
  }
  const res = await httpRequest(`${BLUESKY_PDS_URL}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ repo: did, collection, rkey }),
    retries: 0,
  });
  if (!res.ok) await throwFromResponse(res, "Hapus post Bluesky");
}

/**
 * Facebook Page post: DELETE /{post-id}?access_token=<page token>.
 *
 * ⚠️ Ini menghapus post dari Halaman secara permanen. Dipakai hanya untuk post
 * yang memang diterbitkan lewat Sahabat Kreator dan dimiliki organisasi sendiri
 * (route memverifikasi kepemilikan sebelum memanggil fungsi ini).
 */
async function deleteFacebook(input: DeletePublishedPostInput): Promise<void> {
  const token =
    (typeof input.accountMetadata?.pageAccessToken === "string"
      ? input.accountMetadata.pageAccessToken
      : null) ?? input.accessToken;
  const res = await httpRequest(`${GRAPH_FB_URL}/${input.platformPostId}`, {
    method: "DELETE",
    query: { access_token: token },
    retries: 0,
  });
  if (!res.ok) await throwFromResponse(res, "Hapus post Facebook");
}
