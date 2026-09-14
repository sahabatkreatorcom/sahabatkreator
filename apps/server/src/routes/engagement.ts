// API Engagement — unified inbox (komentar, mention, DM, review)

import { db } from "@sahabatkreator/db";
import { engagementItem, savedResponse, socialAccount } from "@sahabatkreator/db/schema";
import { PublishError, sendReply, syncAccountEngagement } from "@sahabatkreator/publishing";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, HTTPError, requireOrg } from "../lib/auth-guard";
import { decrypt } from "../lib/crypto";
import { generateId } from "../lib/id";

export const engagementRoute = new Hono();

/** GET /engagement — list inbox items (filter: type, status, platform, hidden) */
engagementRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const type = c.req.query("type");
    const status = c.req.query("status");
    const platform = c.req.query("platform");
    const hidden = c.req.query("hidden");

    const conditions = [eq(engagementItem.organizationId, ctx.organization.id)];
    if (type === "comment" || type === "mention" || type === "dm" || type === "review") {
      conditions.push(eq(engagementItem.type, type));
    }
    if (status === "unread" || status === "read" || status === "replied" || status === "archived") {
      conditions.push(eq(engagementItem.status, status));
    }
    if (platform && platform !== "all") {
      conditions.push(eq(socialAccount.platform, platform as "instagram"));
    }
    // Default: item tersembunyi tidak tampil; ?hidden=true untuk lihat yang disembunyikan
    if (hidden === "true") {
      conditions.push(eq(engagementItem.hidden, true));
    } else {
      conditions.push(eq(engagementItem.hidden, false));
    }

    const items = await db
      .select({
        id: engagementItem.id,
        type: engagementItem.type,
        status: engagementItem.status,
        hidden: engagementItem.hidden,
        platform: socialAccount.platform,
        accountUsername: socialAccount.username,
        parentId: engagementItem.parentId,
        authorName: engagementItem.authorName,
        authorUsername: engagementItem.authorUsername,
        authorAvatarUrl: engagementItem.authorAvatarUrl,
        content: engagementItem.content,
        rating: engagementItem.rating,
        replyContent: engagementItem.replyContent,
        repliedAt: engagementItem.repliedAt,
        labels: engagementItem.labels,
        sentiment: engagementItem.sentiment,
        occurredAt: engagementItem.occurredAt,
      })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .where(and(...conditions))
      .orderBy(desc(engagementItem.occurredAt))
      .limit(200);

    // Hitung unread per type untuk badge — agregasi di SQL (count + group by),
    // bukan load semua baris lalu dihitung di memory
    const countRows = await db
      .select({
        type: engagementItem.type,
        count: sql<number>`count(*)::int`,
      })
      .from(engagementItem)
      .where(
        and(
          eq(engagementItem.organizationId, ctx.organization.id),
          eq(engagementItem.status, "unread"),
        ),
      )
      .groupBy(engagementItem.type);

    const unreadByType: Record<string, number> = {};
    for (const row of countRows) {
      unreadByType[row.type] = row.count;
    }

    return c.json({ items, unreadByType });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Moderasi komentar (M12) — hide/unhide & delete, org-scoped.
// Route spesifik DIDAHULUKAN sebelum /:id generik (pola matching Hono).
// ---------------------------------------------------------------------------

/** PATCH /engagement/comments/:id — hide/unhide komentar { hidden: boolean } */
engagementRoute.patch("/comments/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ hidden: z.boolean() }).parse(await c.req.json());

    // Org-scope: pastikan item milik org (join socialAccount)
    const [row] = await db
      .select({ id: engagementItem.id })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .where(
        and(
          eq(engagementItem.id, c.req.param("id")),
          eq(engagementItem.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPError(404, "Komentar tidak ditemukan");

    await db
      .update(engagementItem)
      .set({ hidden: input.hidden })
      .where(eq(engagementItem.id, row.id));

    return c.json({ ok: true, hidden: input.hidden });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /engagement/comments/:id — hapus komentar dari inbox (org-scoped) */
engagementRoute.delete("/comments/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);

    const rows = await db
      .delete(engagementItem)
      .where(
        and(
          eq(engagementItem.id, c.req.param("id")),
          eq(engagementItem.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: engagementItem.id });
    if (rows.length === 0) throw new HTTPError(404, "Komentar tidak ditemukan");

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /engagement/sync-now — trigger sync komentar utk semua akun aktif org.
 * Memanggil syncAccountEngagement (fungsi yang sama dipakai worker polling).
 */
engagementRoute.post("/sync-now", async (c) => {
  try {
    const ctx = await requireOrg(c);

    // Semua akun terhubung org (manual tidak punya API utk sync)
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
        ),
      )
      .limit(50);

    // TODO(performance): sync dijalankan sinkron karena frontend membaca hasil
    // (newItems/errors) di response. Jika jadi lambat, ubah jadi fire-and-forget
    // (job queue + response 202) dan tampilkan progres via polling/websocket.
    const results: { platform: string; newItems: number; error?: string }[] = [];
    let newItems = 0;

    for (const account of accounts) {
      // Akun manual / tanpa token tidak bisa sync — skip
      if (account.platform === "manual" || !account.accessTokenEnc) {
        results.push({ platform: account.platform, newItems: 0 });
        continue;
      }

      let accessToken: string;
      try {
        accessToken = decrypt(account.accessTokenEnc);
      } catch {
        results.push({
          platform: account.platform,
          newItems: 0,
          error: "Token akun tidak bisa dibaca — hubungkan ulang akun",
        });
        continue;
      }

      // Fungsi sync yang sama dengan worker polling (packages/publishing)
      const result = await syncAccountEngagement({
        account: {
          id: account.id,
          organizationId: account.organizationId,
          platform: account.platform,
          platformAccountId: account.platformAccountId,
          accessTokenEnc: account.accessTokenEnc,
          metadata: account.metadata,
        },
        accessToken,
      });
      results.push(result);
      newItems += result.newItems;

      // Update lastSyncedAt agar worker polling tidak double-sync segera
      await db
        .update(socialAccount)
        .set({ lastSyncedAt: new Date() })
        .where(eq(socialAccount.id, account.id));
    }

    const errors = results.filter((r) => r.error);
    return c.json({
      ok: true,
      accounts: results.length,
      newItems,
      errors: errors.map((e) => `${e.platform}: ${e.error}`),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /engagement/:id — update status/label/assignment */
engagementRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        status: z.enum(["unread", "read", "replied", "archived"]).optional(),
        labels: z.array(z.string()).optional(),
        replyContent: z.string().optional(),
      })
      .parse(await c.req.json());

    const [row] = await db
      .select()
      .from(engagementItem)
      .where(
        and(
          eq(engagementItem.id, c.req.param("id")),
          eq(engagementItem.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Item tidak ditemukan" }, 404);

    await db
      .update(engagementItem)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
        ...(input.replyContent !== undefined
          ? {
              replyContent: input.replyContent,
              repliedAt: new Date(),
              status: "replied",
            }
          : {}),
      })
      .where(eq(engagementItem.id, row.id));

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /engagement/:id/reply — balas item via API platform (fallback: catat lokal) */
engagementRoute.post("/:id/reply", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ content: z.string().min(1).max(2000) }).parse(await c.req.json());

    // Join item + akun (perlu token & platformAccountId utk kirim reply)
    const [row] = await db
      .select({
        item: engagementItem,
        platform: socialAccount.platform,
        platformAccountId: socialAccount.platformAccountId,
        accessTokenEnc: socialAccount.accessTokenEnc,
        metadata: socialAccount.metadata,
        isConnected: socialAccount.isConnected,
      })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .where(
        and(
          eq(engagementItem.id, c.req.param("id")),
          eq(engagementItem.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Item tidak ditemukan" }, 404);

    // Idempotensi: item sudah dibalas → jangan kirim dua kali
    if (row.item.status === "replied" && row.item.platformReplyId) {
      return c.json({ message: "Item ini sudah dibalas." }, 409);
    }

    let platformReplyId: string | null = null;
    let localOnly = false;

    if (row.isConnected && row.item.platformItemId && row.accessTokenEnc) {
      try {
        // Decrypt bisa gagal (ENCRYPTION_KEY berubah / data korup) → 502 jelas, bukan 500
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
        const result = await sendReply({
          platform: row.platform,
          accessToken,
          platformItemId: row.item.platformItemId,
          platformParentId: row.item.parentId,
          itemType: row.item.type,
          content: input.content,
          platformAccountId: row.platformAccountId,
          accountMetadata: row.metadata,
        });
        platformReplyId = result.replyId;
      } catch (error) {
        // Reply platform gagal (token expired, item dihapus di platform, dsb.)
        // → jangan tandai replied; beri error jelas agar user tahu balasan TIDAK terkirim.
        if (error instanceof PublishError) {
          return c.json({ message: error.message }, 502);
        }
        throw error;
      }
    } else {
      // Akun manual / item tanpa platform id → catat lokal saja
      localOnly = true;
    }

    await db
      .update(engagementItem)
      .set({
        replyContent: input.content,
        repliedAt: new Date(),
        status: "replied",
        platformReplyId,
      })
      .where(eq(engagementItem.id, row.item.id));

    return c.json({ ok: true, platformReplyId, localOnly });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /engagement/batch-read — tandai beberapa item sebagai read */
engagementRoute.post("/batch-read", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ ids: z.array(z.string()).min(1) }).parse(await c.req.json());

    await db
      .update(engagementItem)
      .set({ status: "read" })
      .where(
        and(
          eq(engagementItem.organizationId, ctx.organization.id),
          inArray(engagementItem.id, input.ids),
          eq(engagementItem.status, "unread"),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Saved responses ----------

engagementRoute.get("/saved-responses", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const responses = await db
      .select()
      .from(savedResponse)
      .where(eq(savedResponse.organizationId, ctx.organization.id))
      .orderBy(savedResponse.name);
    return c.json({ responses });
  } catch (error) {
    return errorResponse(error);
  }
});

engagementRoute.post("/saved-responses", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        name: z.string().min(1).max(100),
        content: z.string().min(1).max(2000),
      })
      .parse(await c.req.json());

    const id = generateId("resp");
    await db.insert(savedResponse).values({
      id,
      organizationId: ctx.organization.id,
      name: input.name,
      content: input.content,
    });
    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

engagementRoute.delete("/saved-responses/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .delete(savedResponse)
      .where(
        and(
          eq(savedResponse.id, c.req.param("id")),
          eq(savedResponse.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
