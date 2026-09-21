// API Engagement — unified inbox (komentar, mention, DM, review)

import { db } from "@sahabatkreator/db";
import { engagementItem, savedResponse, socialAccount } from "@sahabatkreator/db/schema";
import {
  moderateComment,
  PublishError,
  replizActiveCredentials,
  replizDeleteContentComment,
  replizGetComment,
  replizLikeComment,
  replizListContentComments,
  replizMessageComment,
  replizUpdateCommentStatus,
  sendReply,
  syncAccountEngagement,
  type ReplizCommentStatus,
} from "@sahabatkreator/publishing";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, HTTPError, requirePermission } from "../lib/auth-guard";
import { isBridgeAccount } from "../lib/bridge";
import { decrypt } from "../lib/crypto";
import { generateId } from "../lib/id";

export const engagementRoute = new Hono();

/** GET /engagement — list inbox items (filter: type, status, platform, hidden) */
engagementRoute.get("/", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
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
        // Draft dari auto-reply AI dry-run — tampil di inbox untuk review manual
        draftReply: engagementItem.draftReply,
        repliedAt: engagementItem.repliedAt,
        labels: engagementItem.labels,
        sentiment: engagementItem.sentiment,
        occurredAt: engagementItem.occurredAt,
        accountMetadata: socialAccount.metadata,
      })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .where(and(...conditions))
      .orderBy(desc(engagementItem.occurredAt))
      .limit(200)
      // Tandai item dari akun bridge Repliz (metadata tidak dilempar ke client)
      .then((rows) =>
        rows.map(({ accountMetadata, ...row }) => ({
          ...row,
          isBridge: isBridgeAccount(accountMetadata),
        })),
      );

    // Hitung unread per type untuk badge — agregasi di SQL (count + group by),
    // bukan load semua baris lalu dihitung di memory
    const countConditions = [
      eq(engagementItem.organizationId, ctx.organization.id),
      eq(engagementItem.status, "unread"),
      eq(engagementItem.hidden, false),
    ];
    if (platform && platform !== "all") {
      countConditions.push(eq(socialAccount.platform, platform as "instagram"));
    }

    const countRows = await db
      .select({
        type: engagementItem.type,
        count: sql<number>`count(*)::int`,
      })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .where(and(...countConditions))
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
    const ctx = await requirePermission(c, "engagement.moderate");
    const input = z.object({ hidden: z.boolean() }).parse(await c.req.json());

    // Org-scope: pastikan item milik org (join socialAccount)
    const [row] = await db
      .select({
        id: engagementItem.id,
        platform: socialAccount.platform,
        platformItemId: engagementItem.platformItemId,
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
          eq(engagementItem.type, "comment"),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPError(404, "Komentar tidak ditemukan");

    if (!row.isConnected) {
      throw new PublishError(
        "account_not_connected",
        "Akun platform tidak terhubung — hubungkan ulang akun.",
        false,
      );
    }
    // Akun bridge Repliz: token platform disimpan Repliz; moderasi via Comment API
    // Repliz (tidak butuh token lokal — moderateComment dispatch bridge).
    if (!row.accessTokenEnc && !isBridgeAccount(row.metadata)) {
      throw new PublishError(
        "account_not_connected",
        "Token akun tidak tersedia — hubungkan ulang akun.",
        false,
      );
    }

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

    await moderateComment(
      {
        platform: row.platform,
        accessToken,
        platformItemId: row.platformItemId,
        hidden: input.hidden,
        accountMetadata: row.metadata,
      },
      "hide",
    );

    await db
      .update(engagementItem)
      .set({ hidden: input.hidden })
      .where(eq(engagementItem.id, row.id));

    return c.json({ ok: true, hidden: input.hidden, platformSynced: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /engagement/comments/:id — hapus komentar dari inbox (org-scoped) */
engagementRoute.delete("/comments/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.moderate");

    const [row] = await db
      .select({
        id: engagementItem.id,
        platform: socialAccount.platform,
        platformItemId: engagementItem.platformItemId,
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
          eq(engagementItem.type, "comment"),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPError(404, "Komentar tidak ditemukan");

    if (!row.isConnected) {
      throw new PublishError(
        "account_not_connected",
        "Akun platform tidak terhubung — hubungkan ulang akun.",
        false,
      );
    }
    // Akun bridge Repliz: token platform disimpan Repliz; moderasi via Comment API
    // Repliz (tidak butuh token lokal — moderateComment dispatch bridge).
    if (!row.accessTokenEnc && !isBridgeAccount(row.metadata)) {
      throw new PublishError(
        "account_not_connected",
        "Token akun tidak tersedia — hubungkan ulang akun.",
        false,
      );
    }

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

    await moderateComment(
      {
        platform: row.platform,
        accessToken,
        platformItemId: row.platformItemId,
        accountMetadata: row.metadata,
      },
      "delete",
    );

    const rows = await db
      .delete(engagementItem)
      .where(
        and(
          eq(engagementItem.id, row.id),
          eq(engagementItem.organizationId, ctx.organization.id),
          eq(engagementItem.type, "comment"),
        ),
      )
      .returning({ id: engagementItem.id });
    if (rows.length === 0) throw new HTTPError(404, "Komentar tidak ditemukan");

    return c.json({ ok: true, platformSynced: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * Sync state per org — disimpan in-memory (server = satu proses long-running).
 * Dipakai agar POST /sync-now tidak memblokir: request langsung balas 202,
 * pekerjaan sync dijalankan di background, frontend polling /sync-status.
 */
type SyncState = {
  running: boolean;
  startedAt: number;
  finishedAt?: number;
  result: { accounts: number; newItems: number; errors: string[] } | null;
};
const syncStates = new Map<string, SyncState>();

const SYNC_MAX_RUNTIME_MS = 5 * 60 * 1000; // guardian: anggap hang setelah 5 menit

/** Jalankan sync engagement semua akun org di background (fire-and-forget). */
async function runEngagementSync(
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
  const state: SyncState = { running: true, startedAt: Date.now(), result: null };
  syncStates.set(organizationId, state);

  try {
    const settled = await Promise.allSettled(
      accounts
        // Akun bridge Repliz tidak punya token lokal (disimpan Repliz) — tetap
        // disync; syncAccountEngagement → syncRepliz baca kredensial sendiri.
        .filter((a) => a.platform !== "manual" && (a.accessTokenEnc || a.metadata?.replizAccountId))
        .map(async (account) => {
          const accessTokenEnc = account.accessTokenEnc;
          if (!accessTokenEnc && !account.metadata?.replizAccountId) {
            return {
              platform: account.platform,
              newItems: 0,
              error: "Token akun tidak tersedia — hubungkan ulang akun",
            };
          }
          let accessToken: string;
          try {
            accessToken = accessTokenEnc ? decrypt(accessTokenEnc) : "";
          } catch {
            console.warn(
              `[engagement] sync-now: decrypt failed for ${account.platform} (${account.id})`,
            );
            return {
              platform: account.platform,
              newItems: 0,
              error: "Token akun tidak bisa dibaca — hubungkan ulang akun",
            };
          }
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
          // Update lastSyncedAt agar worker polling tidak double-sync segera
          await db
            .update(socialAccount)
            .set({ lastSyncedAt: new Date() })
            .where(eq(socialAccount.id, account.id));
          return result;
        }),
    );

    const results: { platform: string; newItems: number; error?: string }[] = [];
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
        console.log(
          `[engagement] sync-now: ${outcome.value.platform}: newItems=${outcome.value.newItems}` +
            (outcome.value.error ? ` error=${outcome.value.error}` : ""),
        );
      } else {
        const errMsg =
          outcome.reason instanceof Error
            ? outcome.reason.message.slice(0, 200)
            : String(outcome.reason);
        console.warn(`[engagement] sync-now: rejected: ${errMsg}`);
        results.push({ platform: "unknown", newItems: 0, error: errMsg });
      }
    }
    const newItems = results.reduce((sum, r) => sum + r.newItems, 0);
    const errors = results.filter((r) => r.error);

    state.result = {
      accounts: results.length,
      newItems,
      errors: errors.map((e) => `${e.platform}: ${e.error}`),
    };
    console.log(
      `[engagement] sync-now done: accounts=${results.length} newItems=${newItems} errors=${errors.length}`,
    );
  } catch (error) {
    console.error("[engagement] sync-now background error:", error);
    state.result = {
      accounts: 0,
      newItems: 0,
      errors: [error instanceof Error ? error.message.slice(0, 200) : String(error)],
    };
  } finally {
    state.running = false;
    state.finishedAt = Date.now();
  }
}

/**
 * POST /engagement/sync-now — trigger sync komentar utk semua akun aktif org.
 *
 * **Non-blocking**: langsung balas 202 dan jalankan sync di background. Sebelumnya
 * request memblokir sampai semua akun selesai (Threads = hingga 22 panggilan API
 * per akun) → reverse proxy (nginx/Cloudflare, timeout ~60-100s) memutus koneksi
 * dengan 502 meski server tetap menyelesaikan sync. Lihat GET /sync-status.
 */
engagementRoute.post("/sync-now", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    console.log(`[engagement] sync-now triggered for org ${ctx.organization.id}`);

    const existing = syncStates.get(ctx.organization.id);
    // Guardian: anggap hang kalau state running lebih dari 5 menit (server restart)
    if (existing?.running && Date.now() - existing.startedAt < SYNC_MAX_RUNTIME_MS) {
      return c.json({ ok: true, status: "already_running" as const });
    }

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

    console.log(`[engagement] sync-now: ${accounts.length} connected accounts`);

    // Fire-and-forget — jangan di-await, balas 202 segera
    void runEngagementSync(ctx.organization.id, accounts);

    return c.json({ ok: true, status: "started" as const });
  } catch (error) {
    console.error("[engagement] sync-now error:", error);
    return errorResponse(error);
  }
});

/**
 * GET /engagement/sync-status — status sync background (dipoll frontend).
 * Membersihkan state hang (> 5 menit) sekaligus saat dibaca.
 */
engagementRoute.get("/sync-status", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const state = syncStates.get(ctx.organization.id);
    if (!state) {
      return c.json({ ok: true, running: false, result: null });
    }
    // Guardian: bersihkan state hang
    if (state.running && Date.now() - state.startedAt > SYNC_MAX_RUNTIME_MS) {
      console.warn(
        `[engagement] sync-status: stale run detected for org ${ctx.organization.id}, resetting`,
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

/** PATCH /engagement/:id — update status/label/assignment */
engagementRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const input = z
      .object({
        status: z.enum(["unread", "read", "replied", "archived"]).optional(),
        labels: z.array(z.string()).optional(),
        replyContent: z.string().optional(),
        // Buang draft auto-reply AI (dismiss) saat ditolak / sudah dikirim manual
        clearDraft: z.boolean().optional(),
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
              // Reply terkirim → draft tidak lagi relevan
              draftReply: null,
            }
          : {}),
        ...(input.clearDraft ? { draftReply: null } : {}),
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
    const ctx = await requirePermission(c, "engagement.reply");
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

    // Akun bridge Repliz: token platform disimpan Repliz — reply dikirim lewat
    // Comment API Repliz (dispatch di sendReply via accountMetadata).
    const isBridge = isBridgeAccount(row.metadata);
    if (row.isConnected && row.item.platformItemId && (row.accessTokenEnc || isBridge)) {
      try {
        // Decrypt bisa gagal (ENCRYPTION_KEY berubah / data korup) → 502 jelas, bukan 500
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
        // Reply terkirim → draft auto-reply AI (jika ada) tidak lagi relevan
        draftReply: null,
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
    const ctx = await requirePermission(c, "engagement.view");
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

// ---------- Komentar per post (Content API Repliz, Gold+) ----------
// Dipakai untuk melihat & memoderasi komentar di satu post terbit — melengkapi
// antrian inbox global yang hanya menampilkan komentar belum dibalas.

/** GET /engagement/posts/:contentId/comments — list komentar di satu post */
engagementRoute.get("/posts/:contentId/comments", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const accountId = await resolveBridgeAccountByPost(ctx.organization.id, c.req.param("contentId"));
    if (!accountId) return c.json({ message: "Post ini tidak terhubung via bridge" }, 400);

    const data = await replizListContentComments(
      cred,
      c.req.param("contentId"),
      accountId,
      c.req.query("nextToken") ?? undefined,
    );
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PUT /engagement/comments/:id/status — update status moderasi (resolved/ignored) */
engagementRoute.put("/comments/:id/status", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.moderate");
    const input = z.object({ status: z.enum(["pending", "resolved", "ignored"]) }).parse(
      await c.req.json(),
    );

    const [row] = await db
      .select({
        id: engagementItem.id,
        platformItemId: engagementItem.platformItemId,
        metadata: socialAccount.metadata,
        organizationId: engagementItem.organizationId,
      })
      .from(engagementItem)
      .innerJoin(socialAccount, eq(engagementItem.socialAccountId, socialAccount.id))
      .where(
        and(
          eq(engagementItem.id, c.req.param("id")),
          eq(engagementItem.organizationId, ctx.organization.id),
          eq(engagementItem.type, "comment"),
        ),
      )
      .limit(1);
    if (!row) throw new HTTPError(404, "Komentar tidak ditemukan");

    const replizAccountId = (row.metadata as { replizAccountId?: string } | null)?.replizAccountId;
    if (!replizAccountId) {
      return c.json({ message: "Komentar ini bukan dari akun bridge Repliz" }, 400);
    }

    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    if (!row.platformItemId) {
      return c.json({ message: "Komentar tidak memiliki ID platform" }, 400);
    }

    await replizUpdateCommentStatus(
      cred,
      row.platformItemId,
      input.status as ReplizCommentStatus,
    );

    // Status inbox lokal ikut: resolved → read+replied, ignored → archived
    const localStatus = input.status === "resolved" ? "replied" : input.status === "ignored" ? "archived" : "read";
    await db
      .update(engagementItem)
      .set({ status: localStatus })
      .where(eq(engagementItem.id, row.id));

    return c.json({ ok: true, status: input.status });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /engagement/posts/:contentId/comments/:commentId/like — like komentar
 * (hanya Facebook, TikTok, LinkedIn — gate UI via supportsReplizLike()). */
engagementRoute.post("/posts/:contentId/comments/:commentId/like", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.moderate");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const accountId = await resolveBridgeAccountByPost(ctx.organization.id, c.req.param("contentId"));
    if (!accountId) return c.json({ message: "Post ini tidak terhubung via bridge" }, 400);

    await replizLikeComment(cred, c.req.param("contentId"), c.req.param("commentId"));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /engagement/posts/:contentId/comments/message — balas komentar via DM
 * (POST /public/content/{id}/message — hanya Facebook & Instagram). */
engagementRoute.post("/posts/:contentId/comments/message", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.moderate");
    const input = z.object({ text: z.string().min(1).max(2000) }).parse(await c.req.json());

    const accountId = await resolveBridgeAccountByPost(ctx.organization.id, c.req.param("contentId"));
    if (!accountId) return c.json({ message: "Post ini tidak terhubung via bridge" }, 400);

    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const messageId = await replizMessageComment(
      cred,
      c.req.param("contentId"),
      accountId,
      input.text,
    );
    return c.json({ ok: true, messageId });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /engagement/posts/:contentId/comments/:commentId — hapus komentar di post */
engagementRoute.delete("/posts/:contentId/comments/:commentId", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.moderate");
    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);

    const accountId = await resolveBridgeAccountByPost(ctx.organization.id, c.req.param("contentId"));
    if (!accountId) return c.json({ message: "Post ini tidak terhubung via bridge" }, 400);

    await replizDeleteContentComment(cred, c.req.param("contentId"), c.req.param("commentId"));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /engagement/comments/:id/detail — detail satu komentar dari Repliz */
engagementRoute.get("/comments/:id/detail", async (c) => {
  try {
    const ctx = await requirePermission(c, "engagement.view");
    const [row] = await db
      .select({ platformItemId: engagementItem.platformItemId, metadata: socialAccount.metadata })
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

    const replizAccountId = (row.metadata as { replizAccountId?: string } | null)?.replizAccountId;
    if (!replizAccountId) {
      return c.json({ message: "Komentar ini bukan dari akun bridge Repliz" }, 400);
    }

    const cred = await replizActiveCredentials();
    if (!cred) return c.json({ message: "Bridge Repliz belum dikonfigurasi" }, 503);
    if (!row.platformItemId) {
      return c.json({ message: "Komentar tidak memiliki ID platform" }, 400);
    }
    const data = await replizGetComment(cred, row.platformItemId);
    if (!data) return c.json({ message: "Komentar tidak ditemukan di Repliz" }, 404);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * Ambil replizAccountId org dari post yang dikomentari.
 * contentId = platformPostId post terbit (Repliz content id == platform post id,
 * lihat pipeline.ts:replizGetContent(cred, sched.postId, …)).
 */
async function resolveBridgeAccountByPost(
  orgId: string,
  contentId: string,
): Promise<string | null> {
  const { post: postTable, postGroup } = await import("@sahabatkreator/db/schema");
  const [p] = await db
    .select({ metadata: socialAccount.metadata })
    .from(postTable)
    .innerJoin(socialAccount, eq(postTable.socialAccountId, socialAccount.id))
    .innerJoin(postGroup, eq(postTable.postGroupId, postGroup.id))
    .where(and(eq(postTable.platformPostId, contentId), eq(postGroup.organizationId, orgId)))
    .limit(1);
  const meta = p?.metadata as { replizAccountId?: string } | null;
  return meta?.replizAccountId ?? null;
}

// ---------- Saved responses ----------

engagementRoute.get("/saved-responses", async (c) => {  try {
    const ctx = await requirePermission(c, "engagement.view");
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
    const ctx = await requirePermission(c, "engagement.view");
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
    const ctx = await requirePermission(c, "engagement.view");
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
