// Comment moderation adapter — hide/unhide and delete comments on supported platforms.
import { GRAPH_FB_URL, GRAPH_IG_URL, GRAPH_THREADS_URL } from "./config";
import { httpRequest, throwFromResponse } from "./http";
import { replizActiveCredentials, replizDeleteComment } from "./repliz";
import { PublishError } from "./types";

export type CommentModerationInput = {
  platform: string;
  accessToken: string;
  platformItemId: string | null;
  hidden?: boolean;
  accountMetadata?: Record<string, unknown> | null;
};

function tokenFor(input: CommentModerationInput): string {
  return (
    (typeof input.accountMetadata?.pageAccessToken === "string"
      ? input.accountMetadata.pageAccessToken
      : null) ?? input.accessToken
  );
}

function moderationEndpoint(input: CommentModerationInput): string {
  if (input.platform === "instagram_standalone") return `${GRAPH_IG_URL}/${input.platformItemId}`;
  if (input.platform === "instagram" || input.platform === "facebook") {
    return `${GRAPH_FB_URL}/${input.platformItemId}`;
  }
  throw new PublishError(
    "comment_moderation_unsupported",
    `Moderasi komentar belum didukung untuk platform ${input.platform}.`,
    false,
  );
}

function assertCommentId(input: CommentModerationInput): string {
  if (!input.platformItemId) {
    throw new PublishError("no_platform_item", "Komentar tidak punya ID platform.", false);
  }
  return input.platformItemId;
}

/** Hide/unhide or delete a comment through the platform API. */
export async function moderateComment(
  input: CommentModerationInput,
  action: "hide" | "delete",
): Promise<void> {
  const commentId = assertCommentId(input);

  // Akun bridge Repliz: moderasi lewat Comment API Repliz. Repliz tidak punya
  // konsep hide di platform (model statusnya pending/resolved/ignored di antrian
  // Repliz — tidak menyembunyikan komentar di platform asli), jadi hanya delete
  // yang didukung; hide diberi pesan jelas agar tidak menyesatkan user.
  if (input.accountMetadata?.replizAccountId) {
    if (action === "hide") {
      throw new PublishError(
        "comment_moderation_unsupported",
        "Sembunyikan komentar tidak didukung via bridge Repliz — hanya hapus.",
        false,
      );
    }
    const cred = await replizActiveCredentials();
    if (!cred) {
      throw new PublishError(
        "bridge_not_configured",
        "Bridge Repliz tidak aktif — hubungi admin.",
        false,
      );
    }
    await replizDeleteComment(cred, commentId);
    return;
  }

  const accessToken = tokenFor(input);

  // Threads punya endpoint sendiri: `POST /{reply-id}/manage_reply` dengan
  // `hide=true|false`. Tidak ada hapus reply untuk Threads (API hanya
  // menyediakan hide/unhide + manajemen siapa yang boleh membalas), jadi
  // delete diberikan pesan jelas alih-alih memanggil endpoint yang salah.
  // Catatan: yang dikirim harus **reply id** (bukan post id). `platformItemId`
  // pada item tipe comment/reply sudah berupa reply id, jadi aman.
  // Ref: https://developers.facebook.com/docs/threads/reply-management
  // PENTING: cabang ini harus SEBELUM `moderationEndpoint()` — fungsi itu
  // melempar untuk platform di luar IG/FB, sehingga Threads akan gagal duluan.
  if (input.platform === "threads") {
    if (action === "delete") {
      throw new PublishError(
        "comment_moderation_unsupported",
        "Hapus balasan belum didukung untuk Threads — API Threads hanya menyediakan sembunyikan/tampilkan.",
        false,
      );
    }
    const response = await httpRequest(`${GRAPH_THREADS_URL}/${commentId}/manage_reply`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `hide=${input.hidden === true ? "true" : "false"}`,
      query: { access_token: accessToken },
    });
    if (!response.ok) await throwFromResponse(response, "Moderasi balasan Threads");
    return;
  }

  const endpoint = moderationEndpoint(input);

  if (action === "delete") {
    const response = await httpRequest(endpoint, {
      method: "DELETE",
      query: { access_token: accessToken },
    });
    if (!response.ok) await throwFromResponse(response, "Hapus komentar");
    return;
  }

  const isInstagram = input.platform === "instagram" || input.platform === "instagram_standalone";
  const response = await httpRequest(endpoint, {
    method: "POST",
    query: {
      ...(isInstagram ? { hide: input.hidden === true } : { is_hidden: input.hidden === true }),
      access_token: accessToken,
    },
  });
  if (!response.ok) await throwFromResponse(response, "Moderasi komentar");
}

/**
 * Like/unlike komentar sebagai Page (`pages_manage_engagement`).
 *
 * Meta meminta SATU permission ini mencakup tiga aksi — "reply, hide, like" —
 * dan App Review menolak pengajuan bila demo tidak memperlihatkan like
 * (itu yang terjadi pada pengajuan 3 Okt 2026: ditolak karena "belum ada like
 * komentar"). Karena itu like harus benar-benar jalan, bukan sekadar tombol.
 *
 * Endpoint (terverifikasi langsung pada Page SHD Store, 4 Okt 2026):
 *   - like   → `POST   /{comment-id}/likes` → 200 `{"success":true}`
 *   - unlike → `DELETE /{comment-id}/likes` → 200 `{"success":true}`
 *   - verifikasi: `GET /{comment-id}/likes?summary=total_count,can_like,has_liked`
 *     menunjukkan `total_count` 0→1 dan `has_liked` false→true, lalu kembali.
 *
 * JEBAKAN: `POST /{comment-id}/reactions?type=LIKE` TIDAK dipakai — dijawab
 * HTTP 400 `(#3) Application does not have the capability to make this API call`.
 * Referensi resmi edge `likes`/`reactions` juga menulis "can't create", padahal
 * `POST /likes` nyatanya jalan — jangan percaya catatan docs itu tanpa uji.
 */
export async function likeComment(input: CommentModerationInput, liked: boolean): Promise<void> {
  const commentId = assertCommentId(input);

  // Akun bridge Repliz: token platform dipegang Repliz dan like-nya lewat
  // Comment API Repliz (`POST /public/content/{id}/like/{commentId}`) yang butuh
  // contentId — bukan bentuk input ini. Beri pesan jelas alih-alih salah endpoint.
  if (input.accountMetadata?.replizAccountId) {
    throw new PublishError(
      "comment_like_unsupported",
      "Like komentar lewat bridge Repliz belum didukung dari inbox — gunakan tombol pada detail post.",
      false,
    );
  }

  // Saat ini hanya Facebook Page yang terbukti punya edge ini. Instagram tidak
  // mendokumentasikan `/{ig-comment-id}/likes`, jadi jangan menembak endpoint
  // yang belum teruji.
  if (input.platform !== "facebook") {
    throw new PublishError(
      "comment_like_unsupported",
      `Like komentar belum didukung untuk platform ${input.platform}.`,
      false,
    );
  }

  const accessToken = tokenFor(input);
  const response = await httpRequest(`${GRAPH_FB_URL}/${commentId}/likes`, {
    method: liked ? "POST" : "DELETE",
    query: { access_token: accessToken },
  });
  if (!response.ok) {
    await throwFromResponse(response, liked ? "Suka komentar" : "Batal suka komentar");
  }
}
