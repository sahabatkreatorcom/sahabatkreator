// Comment moderation adapter — hide/unhide and delete comments on supported platforms.
import { GRAPH_FB_URL, GRAPH_IG_URL } from "./config";
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

  const endpoint = moderationEndpoint(input);
  const accessToken = tokenFor(input);

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
