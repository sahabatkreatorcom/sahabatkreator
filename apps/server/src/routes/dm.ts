// API DM Inbox — percakapan direct message (list, thread, reply, mark read, assign)

import { db } from "@sahabatkreator/db";
import {
  dmConversation,
  dmMessage,
  member,
  socialAccount,
} from "@sahabatkreator/db/schema";
import { PublishError, sendDMReply } from "@sahabatkreator/publishing";
import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requirePermission } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";
import { generateId } from "../lib/id";

export const dmRoute = new Hono();

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

    if (row.isConnected && row.accessTokenEnc) {
      try {
        let accessToken: string;
        try {
          accessToken = decrypt(row.accessTokenEnc);
        } catch {
          throw new PublishError(
            "token_decrypt_failed",
            "Token akun tidak bisa dibaca — hubungkan ulang akun.",
            false,
          );
        }
        // Token: page access token (IG/FB) atau user token (LinkedIn)
        const token =
          (typeof row.metadata?.pageAccessToken === "string"
            ? (row.metadata.pageAccessToken as string)
            : null) ?? accessToken;

        const result = await sendDMReply({
          platform: row.platform as
            | "instagram"
            | "instagram_standalone"
            | "facebook"
            | "linkedin"
            | "linkedin_org",
          accessToken: token,
          platformAccountId: row.platformAccountId,
          partnerId: row.conversation.partnerId,
          text: input.content,
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
