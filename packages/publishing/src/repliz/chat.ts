// Chat API (Gold+) — DM percakapan, pesan, kirim, read.
// Docs: docs/repliz/Chat/

import { replizEmpty, replizMissingId, replizRequest, type ReplizCredentials } from "./shared";

/** Percakapan DM di workspace Repliz (GET /public/chat) */
export type ReplizChat = {
  _id: string;
  id: string;
  accountId: string;
  senderId: string;
  senderName?: string;
  senderPicture?: string;
  unreadCount?: number;
  lastMessage?: {
    isFromMe: boolean;
    senderId?: string;
    messageId: string;
    type: string;
    status?: string;
    text?: string;
    sendAt?: string;
    fromSenderAt?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

/** Pesan dalam satu chat Repliz (GET /public/chat/{chatId}/message) */
export type ReplizChatMessage = {
  _id: string;
  id: string;
  chatId: string;
  messageId: string;
  senderId?: string;
  type: string; // text | image | video | audio | document | button
  status?: string;
  isFromMe: boolean;
  text?: string;
  accountId?: string;
  createdAt?: string;
};

/**
 * List percakapan DM akun bridge (filter status unread/unreplied opsional).
 *
 * Filter account WAJIB notasi array `accountIds[]` — bentuk `accountIds=`
 * diabaikan API (diverifikasi live di endpoint comment; chat dokumennya
 * sama: param `accountIds` bertipe array). Bentuk salah → DM seluruh
 * workspace bocor ke inbox akun bridge yang lain.
 */
export async function replizListChats(
  cred: ReplizCredentials,
  opts: {
    accountId: string;
    page?: number;
    limit?: number;
    status?: "unread" | "unreplied";
    search?: string;
  },
): Promise<{
  docs: ReplizChat[];
  totalDocs: number;
  hasNextPage: boolean;
  nextPage: number | null;
}> {
  return replizRequest(cred, "/public/chat", {
    query: {
      page: String(opts.page ?? 1),
      limit: String(opts.limit ?? 20),
      "accountIds[]": opts.accountId,
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.search ? { search: opts.search } : {}),
    },
  });
}

/** Detail satu percakapan by id (GET /public/chat/{chatId}). */
export async function replizGetOneChat(
  cred: ReplizCredentials,
  chatId: string,
): Promise<ReplizChat | null> {
  const data = await replizRequest<Record<string, unknown>>(cred, `/public/chat/${chatId}`);
  if (!data || (!data.id && !data._id)) return null;
  return data as unknown as ReplizChat;
}

/** List pesan satu percakapan (urut createdAt ascending di sisi Repliz) */
export async function replizListChatMessages(
  cred: ReplizCredentials,
  chatId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{
  docs: ReplizChatMessage[];
  totalDocs: number;
  hasNextPage: boolean;
  nextPage: number | null;
}> {
  return replizRequest(cred, `/public/chat/${chatId}/message`, {
    query: { page: String(opts.page ?? 1), limit: String(opts.limit ?? 50) },
  });
}

/**
 * Kirim pesan ke percakapan (POST /public/chat/{chatId}/message) → messageId.
 * Default type "text"; `extra` untuk tipe attachment lain (image/video/audio/
 * document/button) sesuai docs — bentuk { image?: {...}, ... }.
 */
export async function replizSendChatMessage(
  cred: ReplizCredentials,
  chatId: string,
  text: string,
  extra?: Record<string, unknown>,
): Promise<string> {
  const data = await replizRequest<{ messageId?: string }>(cred, `/public/chat/${chatId}/message`, {
    method: "POST",
    body: { type: "text", text, ...extra },
  });
  if (!data?.messageId) {
    throw replizMissingId("repliz_dm_no_id", "Repliz tidak mengembalikan messageId.", true);
  }
  return data.messageId;
}

/** Tandai semua pesan chat sudah dibaca (POST /public/chat/{chatId}/read → 204) */
export async function replizReadChat(cred: ReplizCredentials, chatId: string): Promise<void> {
  await replizEmpty(cred, `/public/chat/${chatId}/read`, { method: "POST", body: {} });
}
