// Sinkronisasi DM (direct message) Instagram/Facebook/LinkedIn
// Riset: docs/social-platforms/{meta-instagram,meta-facebook,linkedin}.md
//
// Endpoint per platform:
// - instagram (jalur FB Login): graph.facebook.com + Page token
// - instagram_standalone (IG Login): graph.instagram.com
// - facebook: graph.facebook.com tanpa param platform
// - linkedin / linkedin_org: api.linkedin.com/v2/messages (Messaging API v2)
//
// Permission yang dibutuhkan:
// - instagram: instagram_manage_messages
// - facebook: pages_messaging
// - linkedin: messaging product (r_member_social + w_member_social)
//
// Selama belum di-approve (app mode development), endpoint balas error code 3/10 —
// di-skip diam-diam agar sync komentar tetap jalan tanpa spam log.

import { db, pushToOrganization } from "@sahabatkreator/db";
import { dmConversation, dmMessage, socialAccount } from "@sahabatkreator/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { processAutomation } from "./automation";
import { GRAPH_FB_URL, GRAPH_IG_URL, LINKEDIN_API_VERSION, LINKEDIN_REST_URL } from "./config";
import { decrypt } from "./crypto";
import type { SyncResult } from "./engagement-sync";
import { httpRequest } from "./http";
import { PublishError } from "./types";

const GRAPH_FB = GRAPH_FB_URL;
const GRAPH_IG = GRAPH_IG_URL;

function generateId(entity: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return `sk_${entity}_${id}`;
}

type MetaMessage = {
  id: string;
  created_time?: string;
  from?: { id?: string; name?: string; username?: string };
  message?: string;
  attachments?: {
    data?: Array<{ image_data?: string; video_data?: string; name?: string; mime_type?: string }>;
  };
};

type MetaConversation = {
  id: string;
  updated_time?: string;
  participants?: { data?: Array<{ id: string; name?: string; username?: string }> };
  messages?: { data?: MetaMessage[] };
};

/** Error Meta: permission belum granted / app belum live — perlu logging untuk debugging */
function isPermissionError(body: string): boolean {
  // code 10 = permission tidak diberikan; code 3 = app mode / scope;
  // subcode 2202 (IG messaging dev mode), 2018108 (account tidak eligibel)
  return /"(code|error_subcode)":\s*(3|10|2202|2018108)\b/.test(body);
}

/**
 * Upsert satu percakapan + pesan-pesannya.
 * - Conversation di-upsert by (socialAccountId, platformConversationId)
 * - Message di-insert bila belum ada (idempoten — webhook + polling aman bentrok)
 * - Field materialized conversation diperbarui (lastMessage, unreadCount)
 * Return jumlah pesan baru.
 */
export async function upsertDMConversation(input: {
  organizationId: string;
  socialAccountId: string;
  platformConversationId: string;
  partner: { id: string; username?: string | null; name?: string | null };
  messages: Array<{
    platformMessageId: string;
    direction: "inbound" | "outbound";
    senderId?: string | null;
    senderUsername?: string | null;
    text?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    occurredAt: Date;
  }>;
}): Promise<number> {
  // 1. Upsert conversation (ambil id existing bila sudah ada)
  const [existing] = await db
    .select({ id: dmConversation.id })
    .from(dmConversation)
    .where(
      and(
        eq(dmConversation.socialAccountId, input.socialAccountId),
        eq(dmConversation.platformConversationId, input.platformConversationId),
      ),
    );

  let conversationId: string;
  if (existing) {
    conversationId = existing.id;
  } else {
    conversationId = generateId("dmconv");
    await db.insert(dmConversation).values({
      id: conversationId,
      organizationId: input.organizationId,
      socialAccountId: input.socialAccountId,
      platformConversationId: input.platformConversationId,
      partnerId: input.partner.id,
      partnerUsername: input.partner.username ?? null,
      partnerName: input.partner.name ?? null,
      lastMessageAt: new Date(0), // di-set ulang di bawah dari pesan terbaru
    });
  }

  // 2. Filter pesan yang belum ada (pre-fetch idempotensi)
  const existingMsgs = await db
    .select({ platformMessageId: dmMessage.platformMessageId })
    .from(dmMessage)
    .where(eq(dmMessage.conversationId, conversationId));
  const existingIds = new Set(existingMsgs.map((m) => m.platformMessageId));
  const fresh = input.messages.filter((m) => !existingIds.has(m.platformMessageId));

  if (fresh.length > 0) {
    await db.insert(dmMessage).values(
      fresh.map((m) => ({
        id: generateId("dmmsg"),
        organizationId: input.organizationId,
        socialAccountId: input.socialAccountId,
        conversationId,
        platformMessageId: m.platformMessageId,
        direction: m.direction,
        senderId: m.senderId ?? null,
        senderUsername: m.senderUsername ?? null,
        text: m.text ?? null,
        mediaUrl: m.mediaUrl ?? null,
        mediaType: m.mediaType ?? null,
        occurredAt: m.occurredAt,
      })),
    );
  }

  // 3. Update materialized fields conversation dari seluruh pesan (bukan hanya yang baru —
  //    menangani kasus conversation baru pertama kali sync dengan pesan lama)
  const latest = input.messages.reduce((acc, m) => (m.occurredAt > acc.occurredAt ? m : acc));
  const newInbound = fresh.filter((m) => m.direction === "inbound").length;

  const preview = latest.text
    ? latest.text.slice(0, 120)
    : latest.mediaUrl
      ? "[Media message]"
      : "";

  await db
    .update(dmConversation)
    .set({
      partnerId: input.partner.id,
      partnerUsername: input.partner.username ?? null,
      partnerName: input.partner.name ?? null,
      lastMessageAt: latest.occurredAt,
      lastMessagePreview: preview,
      lastMessageDirection: latest.direction,
      unreadCount: sql`${dmConversation.unreadCount} + ${newInbound}`,
    })
    .where(eq(dmConversation.id, conversationId));

  // Push notifikasi DM baru (best-effort — jangan gagalkan sync)
  if (newInbound > 0) {
    await pushToOrganization(input.organizationId, "new_dm", {
      title: "Pesan baru masuk",
      body: `${input.partner.name ?? input.partner.username ?? "Seseorang"}: ${preview || "[Media]"}`,
      url: "/inbox",
      tag: "inbox-dm",
    }).catch(() => undefined);

    // Automation: evaluasi keyword trigger untuk tiap pesan inbound baru (best-effort)
    for (const msg of fresh.filter((m) => m.direction === "inbound")) {
      if (!msg.text) continue;
      await processAutomation({
        organizationId: input.organizationId,
        socialAccountId: input.socialAccountId,
        source: "dm",
        platformItemId: msg.platformMessageId,
        text: msg.text,
        partnerName: input.partner.name ?? null,
        partnerUsername: input.partner.username ?? null,
        partnerId: input.partner.id,
      }).catch(() => undefined);
    }
  }

  return fresh.length;
}

/** Sync DM satu akun (instagram / instagram_standalone / facebook / linkedin) */
export async function syncAccountDMs(ctx: {
  account: {
    id: string;
    organizationId: string;
    platform: string;
    platformAccountId: string;
    metadata: Record<string, unknown> | null;
  };
  accessToken: string;
}): Promise<SyncResult> {
  const platform = ctx.account.platform;
  if (platform === "linkedin" || platform === "linkedin_org") {
    return syncLinkedInDMs(ctx);
  }
  // Threads tidak punya DM API — scope threads_read_replies hanya utk reply thread publik
  if (platform === "threads") {
    return { platform, newItems: 0 };
  }
  if (platform !== "instagram" && platform !== "instagram_standalone" && platform !== "facebook") {
    return { platform, newItems: 0 };
  }

  const base = platform === "instagram_standalone" ? GRAPH_IG : GRAPH_FB;
  // Jalur instagram (FB Login) butuh Page token; facebook juga (metadata.pageAccessToken)
  // Instagram Messaging via Facebook Login addresses the connected Page, not the IG user node.
  const apiAccountId =
    platform === "instagram" && typeof ctx.account.metadata?.pageId === "string"
      ? ctx.account.metadata.pageId
      : ctx.account.platformAccountId;
  if (platform === "instagram" && apiAccountId === ctx.account.platformAccountId) {
    return {
      platform,
      newItems: 0,
      error: "Instagram Messaging membutuhkan Page ID akun yang terhubung.",
    };
  }
  const hasPageToken = typeof ctx.account.metadata?.pageAccessToken === "string";
  const token =
    (typeof ctx.account.metadata?.pageAccessToken === "string"
      ? (ctx.account.metadata.pageAccessToken as string)
      : null) ?? ctx.accessToken;

  console.log(
    `[dm-sync] ${platform} syncing: apiAccountId=${apiAccountId} platformAccountId=${ctx.account.platformAccountId} hasPageToken=${hasPageToken} tokenLen=${token.length}`,
  );

  const convRes = await httpRequest<{ data?: MetaConversation[] }>(
    `${base}/${apiAccountId}/conversations`,
    {
      query: {
        platform: platform === "facebook" ? undefined : "instagram",
        fields:
          "id,updated_time,participants{id,name,username},messages.limit(25){id,created_time,from{id,name,username},message,attachments}",
        limit: 25,
        access_token: token,
      },
      retries: 1,
    },
  );

  if (!convRes.ok) {
    const body = await convRes.text().catch(() => "");
    if (isPermissionError(body)) {
      // Permission instagram_manage_messages / pages_messaging belum di-grant —
      // log untuk debugging, tapi skip agar sync lain tetap jalan
      console.warn(
        `[dm-sync] ${platform} permission/mode error (${convRes.status}): ${body.slice(0, 200)}`,
      );
      return { platform, newItems: 0, error: `permission/mode: ${body.slice(0, 100)}` };
    }
    console.warn(
      `[dm-sync] ${platform} conversations API error (${convRes.status}): ${body.slice(0, 200)}`,
    );
    return { platform, newItems: 0, error: `DM conversations: ${body.slice(0, 150)}` };
  }

  const conversations = (await convRes.json()).data ?? [];
  console.log(
    `[dm-sync] ${platform} conversations API OK: ${conversations.length} conversations found`,
  );
  let newItems = 0;

  for (const conv of conversations) {
    const messages = conv.messages?.data ?? [];
    if (messages.length === 0) continue;

    // Partner = participant yang bukan akun kita
    const participants = conv.participants?.data ?? [];
    const partner =
      participants.find((p) => p.id !== ctx.account.platformAccountId) ?? participants[0];
    if (!partner) continue;

    const mapped = messages.map((msg) => ({
      platformMessageId: msg.id,
      direction: (msg.from?.id === ctx.account.platformAccountId ? "outbound" : "inbound") as
        | "inbound"
        | "outbound",
      senderId: msg.from?.id ?? null,
      senderUsername: msg.from?.username ?? null,
      text: msg.message ?? null,
      mediaUrl:
        msg.attachments?.data?.[0]?.image_data ?? msg.attachments?.data?.[0]?.video_data ?? null,
      mediaType: msg.attachments?.data?.[0]?.mime_type?.split("/")[0] ?? null,
      occurredAt: msg.created_time ? new Date(msg.created_time) : new Date(),
    }));

    newItems += await upsertDMConversation({
      organizationId: ctx.account.organizationId,
      socialAccountId: ctx.account.id,
      platformConversationId: conv.id,
      partner: {
        id: partner.id,
        username: partner.username ?? null,
        name: partner.name ?? null,
      },
      messages: mapped,
    });
  }

  return { platform, newItems };
}

/**
 * Kirim balasan DM via platform API.
 * - Instagram (kedua jalur): POST /{ig-id}/messages
 * - Facebook Page: POST /me/messages
 * - LinkedIn: POST /v2/messages (Messaging API v2)
 * Return platformMessageId (message_id response) untuk disimpan sebagai outbound.
 */
export async function sendDMReply(input: {
  platform: "instagram" | "instagram_standalone" | "facebook" | "linkedin" | "linkedin_org";
  accessToken: string;
  platformAccountId: string;
  partnerId: string;
  text: string;
}): Promise<{ platformMessageId: string }> {
  // LinkedIn DM reply
  if (input.platform === "linkedin" || input.platform === "linkedin_org") {
    const res = await httpRequest<{ id?: string }>(`${LINKEDIN_REST_URL}/v2/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        body: input.text,
        messageType: "MEMBER_TO_MEMBER",
        recipients: [input.partnerId],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gagal kirim DM LinkedIn: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!data.id) {
      throw new Error("LinkedIn tidak mengembalikan message ID");
    }
    return { platformMessageId: data.id };
  }

  // Meta platforms (Instagram/Facebook)
  const base = input.platform === "instagram_standalone" ? GRAPH_IG : GRAPH_FB;
  const url =
    input.platform === "facebook"
      ? `${GRAPH_FB}/me/messages`
      : `${base}/${input.platformAccountId}/messages`;

  const res = await httpRequest<{ message_id?: string; recipient_id?: string }>(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: input.partnerId },
      message: { text: input.text },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PublishError(
      "dm_send_failed",
      `Gagal kirim DM ${input.platform} (${res.status}): ${body.slice(0, 300)}`,
      res.status === 429 || res.status >= 500,
    );
  }
  const data = await res.json();
  if (!data.message_id) {
    throw new PublishError(
      "dm_send_no_id",
      `Platform ${input.platform} tidak mengembalikan message ID`,
      true,
    );
  }
  return { platformMessageId: data.message_id };
}

// ---------------------------------------------------------------------------
// LinkedIn — DM via Messaging API v2
// ---------------------------------------------------------------------------

type LinkedInMessage = {
  id: string;
  body?: string;
  createdAt?: number;
  sender?: { "~": string }; // Person URN like "urn:li:person:xxxx"
  conversationUrn?: string;
};

type LinkedInConversation = {
  conversationUrn: string;
  participants?: Array<{ "~": string }>;
  lastActivityAt?: number;
  lastMessagePreview?: string;
  unreadCount?: number;
};

/**
 * Sync DM LinkedIn via Messaging API v2.
 * Endpoint: GET /v2/conversations + GET /v2/messages?conversationUrn={urn}
 *
 * Scope yang dibutuhkan: r_member_social + w_member_social (atau messaging product).
 * Bila scope tidak tersedia, LinkedIn mengembalikan 403/401 — di-skip gracefully.
 *
 * Note: linkedin_org (Community Management API) tidak mendukung reading DMs.
 * Hanya linkedin (personal) yang bisa sync DM.
 */
async function syncLinkedInDMs(ctx: {
  account: {
    id: string;
    organizationId: string;
    platform: string;
    platformAccountId: string;
    metadata: Record<string, unknown> | null;
  };
  accessToken: string;
}): Promise<SyncResult> {
  const { account, accessToken } = ctx;

  // LinkedIn org accounts cannot read DMs via Community Management API
  if (account.platform === "linkedin_org") {
    return { platform: account.platform, newItems: 0 };
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  // 1. Fetch conversations (inbox)
  const convRes = await httpRequest<{
    elements?: LinkedInConversation[];
    paging?: { count: number; start: number; total: number };
  }>(`${LINKEDIN_REST_URL}/v2/conversations`, {
    query: {
      q: "criteria",
      folder: "inbox",
      count: 25,
    },
    headers,
    retries: 1,
  });

  if (!convRes.ok) {
    const body = await convRes.text().catch(() => "");
    // 403/401 = scope messaging belum di-grant — skip tanpa error
    if (convRes.status === 403 || convRes.status === 401) {
      return { platform: account.platform, newItems: 0 };
    }
    return {
      platform: account.platform,
      newItems: 0,
      error: `LI conversations: ${body.slice(0, 150)}`,
    };
  }

  const conversations = (await convRes.json()).elements ?? [];
  let newItems = 0;

  for (const conv of conversations) {
    if (!conv.conversationUrn) continue;

    // 2. Fetch messages for this conversation
    const msgRes = await httpRequest<{
      elements?: LinkedInMessage[];
    }>(`${LINKEDIN_REST_URL}/v2/messages`, {
      query: {
        conversationUrn: conv.conversationUrn,
        count: 25,
      },
      headers,
      retries: 1,
    });

    if (!msgRes.ok) continue;
    const messages = (await msgRes.json()).elements ?? [];
    if (messages.length === 0) continue;

    // Extract partner info from participants
    const participantUrns = conv.participants ?? [];
    const myUrn = account.platformAccountId;
    const partnerUrn = participantUrns.find((p) => p["~"] !== myUrn) ?? participantUrns[0];
    const partnerId = partnerUrn?.["~"] ?? "unknown";

    // Map messages
    const mapped = messages
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((msg) => ({
        platformMessageId: msg.id,
        direction: (msg.sender?.["~"] === myUrn ? "outbound" : "inbound") as "inbound" | "outbound",
        senderId: msg.sender?.["~"] ?? null,
        text: msg.body ?? null,
        occurredAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
      }));

    newItems += await upsertDMConversation({
      organizationId: account.organizationId,
      socialAccountId: account.id,
      platformConversationId: conv.conversationUrn,
      partner: {
        id: partnerId,
        name: null, // LinkedIn API v2 tidak mengembalikan nama di conversations endpoint
      },
      messages: mapped,
    });
  }

  return { platform: account.platform, newItems };
}

// ---------------------------------------------------------------------------
// Sinkronisasi massal — dipakai worker (polling fallback webhook)
// ---------------------------------------------------------------------------

/**
 * Sync akun IG/FB yang due untuk DM (lastDmSyncedAt lebih tua dari intervalMinutes).
 * Terpisah dari syncDueAccounts engagement — tracking kolom sendiri (lastDmSyncedAt)
 * agar satu akun tidak skip sync DM karena baru sync komentar (interval DM lebih panjang).
 * Akun diproses paralel dalam batch kecil — satu akun gagal tidak
 * menghentikan batch lainnya (Promise.allSettled).
 */
export async function syncDueDMAccounts(
  intervalMinutes = 15,
  maxAccounts = 10,
): Promise<{ synced: number; newMessages: number; errors: string[] }> {
  const BATCH_SIZE = 3;
  const since = new Date(Date.now() - intervalMinutes * 60 * 1000);
  const accounts = await db
    .select({
      id: socialAccount.id,
      organizationId: socialAccount.organizationId,
      platform: socialAccount.platform,
      platformAccountId: socialAccount.platformAccountId,
      accessTokenEnc: socialAccount.accessTokenEnc,
      metadata: socialAccount.metadata,
      lastDmSyncedAt: socialAccount.lastDmSyncedAt,
      username: socialAccount.username,
    })
    .from(socialAccount)
    .where(
      and(
        eq(socialAccount.isConnected, true),
        inArray(socialAccount.platform, [
          "instagram",
          "instagram_standalone",
          "facebook",
          "threads",
          "linkedin",
        ]),
      ),
    )
    .limit(maxAccounts * 2);

  const due = accounts
    .filter((a) => !a.lastDmSyncedAt || a.lastDmSyncedAt < since)
    .slice(0, maxAccounts);

  console.log(
    `[dm-sync] ${accounts.length} connected IG/FB/LI accounts, ${due.length} due (interval ${intervalMinutes}m)`,
  );

  let newMessages = 0;
  const errors: string[] = [];
  let synced = 0;

  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const batch = due.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (account) => {
        if (!account.accessTokenEnc) return null;
        const accessToken = decrypt(account.accessTokenEnc);
        const result = await syncAccountDMs({
          account: {
            id: account.id,
            organizationId: account.organizationId,
            platform: account.platform,
            platformAccountId: account.platformAccountId,
            metadata: account.metadata,
          },
          accessToken,
        });
        // Update lastDmSyncedAt sukses ATAU gagal (hindari retry loop error permission tiap tick)
        await db
          .update(socialAccount)
          .set({ lastDmSyncedAt: new Date() })
          .where(eq(socialAccount.id, account.id));
        return { account, result };
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === "rejected") {
        // decrypt gagal / exception tak terduga — catat, lanjut akun lain
        const errMsg =
          outcome.reason instanceof Error
            ? outcome.reason.message.slice(0, 200)
            : String(outcome.reason);
        console.warn(`[dm-sync] account rejected: ${errMsg}`);
        errors.push(errMsg);
        continue;
      }
      const value = outcome.value;
      if (!value) continue; // akun tanpa token terenkripsi
      synced++;
      newMessages += value.result.newItems;
      console.log(
        `[dm-sync] ${value.account.username ?? value.account.id} (${value.account.platform}): ` +
          `newMessages=${value.result.newItems}` +
          (value.result.error ? ` error=${value.result.error}` : ""),
      );
      if (value.result.error) errors.push(`${value.result.platform}: ${value.result.error}`);
    }
  }

  if (synced > 0 || errors.length > 0) {
    console.log(
      `[dm-sync] cycle: ${synced} accounts synced, ${newMessages} new messages` +
        (errors.length > 0 ? `, ${errors.length} errors` : ""),
    );
  }

  return { synced, newMessages, errors };
}
