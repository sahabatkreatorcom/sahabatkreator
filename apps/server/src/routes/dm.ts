// API DM Inbox — percakapan direct message (list, thread, reply, mark read, assign)

import { db } from "@sahabatkreator/db";
import { dmConversation, dmMessage, member, socialAccount } from "@sahabatkreator/db/schema";
import {
  PublishError,
  replizReadChat,
  sendDMReply,
  syncAccountDMs,
} from "@sahabatkreator/publishing";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requirePermission } from "../lib/auth-guard";
import { getReplizCredentials, isBridgeAccount } from "../lib/bridge";
import { decrypt } from "../lib/crypto";
import { generateId } from "../lib/id";

export const dmRoute = new Hono();

/**
 * Tandai percakapan bridge Repliz sudah dibaca di sisi Repliz (best-effort —
 * kegagalan tidak boleh memblokir pembukaan thread di UI kita).
 */
async function replizMarkRead(chatId: string): Promise<void> {
  const cred = await getReplizCredentials();
  if (!cred) return;
  await replizReadChat(cred, chatId);
}

/**
 * DM sync state per org — disimpan in-memory (server = satu proses long-running).
 * Sama seperti engagement: POST /sync-now balas 202 segera, sync jalan di
 * background, frontend polling /dm/sync-status. Mencegah reverse-proxy 502
 * (sync DM IG/FB = banyak panggilan API per akun).
 */
type DmSyncState = {
  running: boolean;
  startedAt: number;
  finishedAt?: number;
  result: { accounts: number; newMessages: number; errors: string[] } | null;
};
const dmSyncStates = new Map<string, DmSyncState>();

const DM_SYNC_MAX_RUNTIME_MS = 5 * 60 * 1000; // guardian: anggap hang setelah 5 menit

/** Jalankan sync DM semua akun org di background (fire-and-forget). */
async function runDmSync(
  organizationId: string,
  accounts: Array<{
    id: string;
    organizationId: string;
    platform: string;
    platformAccountId: string;
    accessTokenEnc: string | null;
    metadata: Record<string, unknown> | null;
  }>,
): Promise<void> {
  const state: DmSyncState = { running: true, startedAt: Date.now(), result: null };
  dmSyncStates.set(organizationId, state);

  try {
    const settled = await Promise.allSettled(
      accounts.map(async (account) => {
        // Akun bridge Repliz: token platform disimpan Repliz — syncAccountDMs
        // dispatch ke syncReplizDMs yang baca kredensial bridge sendiri.
        if (!account.accessTokenEnc && !account.metadata?.replizAccountId) {
          return { platform: account.platform, newMessages: 0, error: "Token tidak tersedia" };
        }
        const accessToken = account.accessTokenEnc ? decrypt(account.accessTokenEnc) : "";
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
        await db
          .update(socialAccount)
          .set({ lastDmSyncedAt: new Date() })
          .where(eq(socialAccount.id, account.id));
        return { platform: account.platform, newMessages: result.newItems, error: result.error };
      }),
    );

    const summary = settled.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : {
            platform: "unknown",
            newMessages: 0,
            error:
              result.reason instanceof Error
                ? result.reason.message.slice(0, 200)
                : String(result.reason),
          },
    );

    state.result = {
      accounts: summary.length,
      newMessages: summary.reduce((sum, result) => sum + result.newMessages, 0),
      errors: summary
        .filter((result) => result.error)
        .map((result) => `${result.platform}: ${result.error}`),
    };
  } catch (error) {
    console.error("[dm] sync-now background error:", error);
    state.result = {
      accounts: 0,
      newMessages: 0,
      errors: [error instanceof Error ? error.message.slice(0, 200) : String(error)],
    };
  } finally {
    state.running = false;
    state.finishedAt = Date.now();
  }
}

/**
 * POST /dm/sync-now — pull conversations for connected DM accounts in this org.
 *
 * **Non-blocking**: langsung balas 202 dan jalankan sync di background (pola sama
 * dengan /engagement/sync-now — sebelumnya memblokir sampai semua akun selesai,
 * reverse proxy memutus koneksi → 502). Lihat GET /dm/sync-status.
 */
dmRoute.post("/sync-now", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");

    const existing = dmSyncStates.get(ctx.organization.id);
    if (existing?.running && Date.now() - existing.startedAt < DM_SYNC_MAX_RUNTIME_MS) {
      return c.json({ ok: true, status: "already_running" as const });
    }

    const accounts = await db
      .select({
        id: socialAccount.id,
        organizationId: socialAccount.organizationId,
        platform: socialAccount.platform,
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
      })
      .from(socialAccount)
      .where(
        and(
          eq(socialAccount.organizationId, ctx.organization.id),
          eq(socialAccount.isConnected, true),
          sql`${socialAccount.platform} IN ('instagram', 'instagram_standalone', 'facebook')`,
        ),
      )
      .limit(20);

    // Fire-and-forget — jangan di-await, balas 202 segera
    void runDmSync(ctx.organization.id, accounts);

    return c.json({ ok: true, status: "started" as const });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /dm/sync-status — status sync DM background (dipoll frontend).
 * Membersihkan state hang (> 5 menit) sekaligus saat dibaca.
 */
dmRoute.get("/sync-status", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const state = dmSyncStates.get(ctx.organization.id);
    if (!state) {
      return c.json({ ok: true, running: false, result: null });
    }
    if (state.running && Date.now() - state.startedAt > DM_SYNC_MAX_RUNTIME_MS) {
      console.warn(
        `[dm] sync-status: stale run detected for org ${ctx.organization.id}, resetting`,
      );
      state.running = false;
    }
    return c.json({
      ok: true,
      running: state.running,
      result: state.result,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /dm — list percakapan (satu SELECT berkat materialized fields).
 * Query: platform, unread (true = hanya yang ada pesan belum dibaca), q (cari nama/username),
 * assignedTo (userId | "unassigned"), page, perPage.
 */
dmRoute.get("/", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const pagination = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse({
        page: c.req.query("page"),
        perPage: c.req.query("perPage"),
      });
    const { page, perPage } = pagination;
    const platform = c.req.query("platform");
    const unreadOnly = c.req.query("unread") === "true";
    const q = c.req.query("q");
    const assignedTo = c.req.query("assignedTo");

    const conditions = [
      eq(dmConversation.organizationId, ctx.organization.id),
      eq(socialAccount.isConnected, true),
    ];
    if (platform) conditions.push(eq(socialAccount.platform, platform as "instagram"));
    if (unreadOnly) conditions.push(gt(dmConversation.unreadCount, 0));
    if (q) {
      const searchCondition = or(
        ilike(dmConversation.partnerName, `%${q}%`),
        ilike(dmConversation.partnerUsername, `%${q}%`),
      );
      if (searchCondition) conditions.push(searchCondition);
    }
    if (assignedTo === "unassigned") {
      conditions.push(sql`${dmConversation.assignedMemberId} IS NULL`);
    } else if (assignedTo) {
      conditions.push(eq(dmConversation.assignedMemberId, assignedTo));
    }

    const rows = await db
      .select({
        id: dmConversation.id,
        platform: socialAccount.platform,
        accountUsername: socialAccount.username,
        partnerId: dmConversation.partnerId,
        partnerUsername: dmConversation.partnerUsername,
        partnerName: dmConversation.partnerName,
        partnerAvatarUrl: dmConversation.partnerAvatarUrl,
        lastMessageAt: dmConversation.lastMessageAt,
        lastMessagePreview: dmConversation.lastMessagePreview,
        lastMessageDirection: dmConversation.lastMessageDirection,
        unreadCount: dmConversation.unreadCount,
        assignedMemberId: dmConversation.assignedMemberId,
      })
      .from(dmConversation)
      .innerJoin(socialAccount, eq(dmConversation.socialAccountId, socialAccount.id))
      .where(and(...conditions))
      .orderBy(desc(dmConversation.lastMessageAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    return c.json({ conversations: rows, page });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /dm/unread-count — badge sidebar/notifikasi */
dmRoute.get("/unread-count", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const [row] = await db
      .select({
        conversations: sql<number>`count(*)::int`,
        messages: sql<number>`coalesce(sum(${dmConversation.unreadCount}), 0)::int`,
      })
      .from(dmConversation)
      .where(
        and(
          eq(dmConversation.organizationId, ctx.organization.id),
          gt(dmConversation.unreadCount, 0),
        ),
      );
    return c.json({
      conversations: row?.conversations ?? 0,
      messages: row?.messages ?? 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * GET /dm/:id/messages — thread pesan (asc by occurredAt).
 * Sekaligus tandai dibaca (unreadCount → 0, pesan inbound → isRead via flag di dm_message?).
 * Status read disimpan di conversation level (unreadCount materialized).
 */
dmRoute.get("/:id/messages", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const id = c.req.param("id");

    // Conversation + akun (pastikan milik org)
    const [conv] = await db
      .select({
        id: dmConversation.id,
        platform: socialAccount.platform,
        accountUsername: socialAccount.username,
        partnerId: dmConversation.partnerId,
        partnerUsername: dmConversation.partnerUsername,
        partnerName: dmConversation.partnerName,
        partnerAvatarUrl: dmConversation.partnerAvatarUrl,
        platformAccountId: socialAccount.platformAccountId,
        unreadCount: dmConversation.unreadCount,
        assignedMemberId: dmConversation.assignedMemberId,
        platformConversationId: dmConversation.platformConversationId,
        metadata: socialAccount.metadata,
      })
      .from(dmConversation)
      .innerJoin(socialAccount, eq(dmConversation.socialAccountId, socialAccount.id))
      .where(and(eq(dmConversation.id, id), eq(dmConversation.organizationId, ctx.organization.id)))
      .limit(1);
    if (!conv) return c.json({ message: "Percakapan tidak ditemukan" }, 404);

    const messages = await db
      .select({
        id: dmMessage.id,
        direction: dmMessage.direction,
        senderUsername: dmMessage.senderUsername,
        text: dmMessage.text,
        mediaUrl: dmMessage.mediaUrl,
        mediaType: dmMessage.mediaType,
        occurredAt: dmMessage.occurredAt,
      })
      .from(dmMessage)
      .where(eq(dmMessage.conversationId, id))
      .orderBy(asc(dmMessage.occurredAt))
      .limit(200);

    // Buka thread → reset unread (materialized di conversation)
    if (conv.unreadCount > 0) {
      await db.update(dmConversation).set({ unreadCount: 0 }).where(eq(dmConversation.id, id));
      // Akun bridge: sync status read ke Repliz juga (POST /public/chat/{id}/read).
      // Best-effort — jangan gagalkan pembukaan thread bila Repliz error.
      if (isBridgeAccount(conv.metadata)) {
        void replizMarkRead(conv.platformConversationId).catch((err) =>
          console.warn(`[dm] repliz read-chat gagal: ${String(err).slice(0, 150)}`),
        );
      }
    }

    return c.json({ conversation: conv, messages });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /dm/:id/reply — kirim balasan via Messenger Send API + simpan outbound */
dmRoute.post("/:id/reply", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.reply");
    const input = z.object({ content: z.string().min(1).max(2000) }).parse(await c.req.json());

    const [row] = await db
      .select({
        conversation: dmConversation,
        platform: socialAccount.platform,
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        isConnected: socialAccount.isConnected,
      })
      .from(dmConversation)
      .innerJoin(socialAccount, eq(dmConversation.socialAccountId, socialAccount.id))
      .where(
        and(
          eq(dmConversation.id, c.req.param("id")),
          eq(dmConversation.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Percakapan tidak ditemukan" }, 404);

    let platformMessageId: string;
    let localOnly = false;

    // Akun bridge Repliz: kirim via Chat API Repliz (dispatch di sendDMReply
    // via accountMetadata + chatId = platform_conversation_id).
    const isBridge = isBridgeAccount(row.metadata);
    if (row.isConnected && (row.accessTokenEnc || isBridge)) {
      try {
        let accessToken: string;
        try {
          accessToken = row.accessTokenEnc ? decrypt(row.accessTokenEnc) : "";
        } catch {
          throw new PublishError(
            "token_decrypt_failed",
            "Token akun tidak bisa dibaca — hubungkan ulang akun.",
            false,
          );
        }
        // Token: page access token (IG/FB) atau user token (LinkedIn);
        // bridge tidak pakai token lokal sama sekali.
        const token = row.accessTokenEnc
          ? ((typeof row.metadata?.pageAccessToken === "string"
              ? (row.metadata.pageAccessToken as string)
              : null) ?? accessToken)
          : "";

        const result = await sendDMReply({
          platform: row.platform as
            | "instagram"
            | "instagram_standalone"
            | "facebook"
            | "linkedin"
            | "linkedin_org",
          accessToken: token,
          platformAccountId:
            row.platform === "instagram" && typeof row.metadata?.pageId === "string"
              ? row.metadata.pageId
              : row.platformAccountId,
          partnerId: row.conversation.partnerId,
          text: input.content,
          accountMetadata: row.metadata,
          chatId: row.conversation.platformConversationId,
        });
        platformMessageId = result.platformMessageId;
      } catch (error) {
        if (error instanceof PublishError) {
          return c.json({ message: error.message }, 502);
        }
        throw error;
      }
    } else {
      // Akun manual → catat lokal (tidak terkirim ke platform)
      localOnly = true;
      platformMessageId = `local_${generateId("dmreply")}`;
    }

    // Simpan pesan outbound + update materialized conversation
    const now = new Date();
    await db.insert(dmMessage).values({
      id: generateId("dmmsg"),
      organizationId: ctx.organization.id,
      socialAccountId: row.conversation.socialAccountId,
      conversationId: row.conversation.id,
      platformMessageId,
      direction: "outbound",
      senderId: row.platformAccountId,
      senderUsername: row.conversation.partnerId, // placeholder; kita = akun sendiri
      text: input.content,
      occurredAt: now,
    });
    await db
      .update(dmConversation)
      .set({
        lastMessageAt: now,
        lastMessagePreview: input.content.slice(0, 120),
        lastMessageDirection: "outbound",
      })
      .where(eq(dmConversation.id, row.conversation.id));

    return c.json({ ok: true, localOnly, platformMessageId });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /dm/:id — update assignedMemberId (assignment ke anggota tim) */
dmRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.reply");
    const input = z.object({ assignedMemberId: z.string().nullable() }).parse(await c.req.json());

    // Validasi member bila di-assign (harus user valid — sederhana: cek exists)
    if (input.assignedMemberId) {
      const [assignedMember] = await db
        .select({ id: member.id })
        .from(member)
        .where(
          and(
            eq(member.userId, input.assignedMemberId),
            eq(member.organizationId, ctx.organization.id),
          ),
        )
        .limit(1);
      if (!assignedMember) return c.json({ message: "User bukan anggota organisasi ini" }, 404);
    }

    const [updated] = await db
      .update(dmConversation)
      .set({ assignedMemberId: input.assignedMemberId })
      .where(
        and(
          eq(dmConversation.id, c.req.param("id")),
          eq(dmConversation.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: dmConversation.id, assignedMemberId: dmConversation.assignedMemberId });
    if (!updated) return c.json({ message: "Percakapan tidak ditemukan" }, 404);

    return c.json({ conversation: updated });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /dm/mark-all-read — reset semua unread percakapan org */
dmRoute.post("/mark-all-read", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const result = await db
      .update(dmConversation)
      .set({ unreadCount: 0 })
      .where(
        and(
          eq(dmConversation.organizationId, ctx.organization.id),
          gt(dmConversation.unreadCount, 0),
        ),
      )
      .returning({ id: dmConversation.id });
    return c.json({ marked: result.length });
  } catch (error) {
    return errorResponse(error);
  }
});
