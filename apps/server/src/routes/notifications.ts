// API Notifikasi — pusat notifikasi in-app (bell di header)

import { db } from "@sahabatkreator/db";
import { notification } from "@sahabatkreator/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requireOrg } from "../lib/auth-guard";

export const notificationsRoute = new Hono();

/** GET /notifications?limit=20 — daftar notifikasi user di org aktif */
notificationsRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);

    const [rows, [unread]] = await Promise.all([
      db
        .select()
        .from(notification)
        .where(
          and(
            eq(notification.userId, ctx.user.id),
            eq(notification.organizationId, ctx.organization.id),
            isNull(notification.dismissedAt),
          ),
        )
        .orderBy(desc(notification.createdAt))
        .limit(limit),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notification)
        .where(
          and(
            eq(notification.userId, ctx.user.id),
            eq(notification.organizationId, ctx.organization.id),
            eq(notification.isRead, false),
            isNull(notification.dismissedAt),
          ),
        ),
    ]);

    return c.json({ notifications: rows, unreadCount: unread?.count ?? 0 });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /notifications/:id/read — tandai satu dibaca */
notificationsRoute.post("/:id/read", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .update(notification)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notification.id, c.req.param("id")),
          eq(notification.userId, ctx.user.id),
          eq(notification.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: notification.id });
    if (rows.length === 0) return c.json({ message: "Notifikasi tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /notifications/read-all — tandai semua dibaca */
notificationsRoute.post("/read-all", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .update(notification)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notification.userId, ctx.user.id),
          eq(notification.organizationId, ctx.organization.id),
          eq(notification.isRead, false),
        ),
      )
      .returning({ id: notification.id });
    return c.json({ ok: true, updated: rows.length });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /notifications/:id/dismiss — sembunyikan permanen */
notificationsRoute.post("/:id/dismiss", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .update(notification)
      .set({ dismissedAt: new Date(), isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notification.id, c.req.param("id")),
          eq(notification.userId, ctx.user.id),
          eq(notification.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: notification.id });
    if (rows.length === 0) return c.json({ message: "Notifikasi tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
