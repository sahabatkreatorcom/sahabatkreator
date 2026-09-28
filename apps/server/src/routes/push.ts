// API Push — subscription web push, VAPID public key, preferensi notifikasi, test send

import {
  db,
  encrypt,
  generateVapidKeys,
  isVapidConfigured,
  pushToUser,
  resetVapidCache,
} from "@sahabatkreator/db";
import { notificationSetting, pushSubscription, vapidKey } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg, requirePlatformAdmin } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const pushRoute = new Hono();

/** Parse device label sederhana dari User-Agent (mis. "Windows · Chrome") */
function deviceLabelFromUA(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Perangkat";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  return `${os} · ${browser}`;
}

/** GET /push/vapid — public key untuk subscribe (user login) */
pushRoute.get("/vapid", async (c) => {
  try {
    await requireOrg(c);
    const [row] = await db
      .select({ publicKey: vapidKey.publicKey })
      .from(vapidKey)
      .where(eq(vapidKey.id, "singleton"));
    return c.json({
      publicKey: row?.publicKey ?? null,
      isConfigured: Boolean(row),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /push/subscriptions — status subscription user di org aktif */
pushRoute.get("/subscriptions", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select({
        id: pushSubscription.id,
        deviceLabel: pushSubscription.deviceLabel,
        lastNotifiedAt: pushSubscription.lastNotifiedAt,
        createdAt: pushSubscription.createdAt,
      })
      .from(pushSubscription)
      .where(
        and(
          eq(pushSubscription.userId, ctx.user.id),
          eq(pushSubscription.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ subscriptions: rows, isSubscribed: rows.length > 0 });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /push/subscribe — daftarkan subscription device baru (upsert by endpoint) */
pushRoute.post("/subscribe", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        endpoint: z.string().url(),
        keys: z.object({ p256dh: z.string(), auth: z.string() }),
      })
      .parse(await c.req.json());

    const [existing] = await db
      .select({ id: pushSubscription.id })
      .from(pushSubscription)
      .where(
        and(
          eq(pushSubscription.userId, ctx.user.id),
          eq(pushSubscription.endpoint, input.endpoint),
        ),
      );

    if (existing) {
      // Refresh keys (bisa berubah setelah browser re-subscribe)
      await db
        .update(pushSubscription)
        .set({
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          deviceLabel: deviceLabelFromUA(c.req.header("user-agent")),
        })
        .where(eq(pushSubscription.id, existing.id));
      return c.json({ ok: true, updated: true });
    }

    await db.insert(pushSubscription).values({
      id: generateId("pushsub"),
      userId: ctx.user.id,
      organizationId: ctx.organization.id,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      deviceLabel: deviceLabelFromUA(c.req.header("user-agent")),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /push/subscribe — hapus subscription (body: endpoint) */
pushRoute.delete("/subscribe", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ endpoint: z.string().url() }).parse(await c.req.json());
    await db
      .delete(pushSubscription)
      .where(
        and(
          eq(pushSubscription.userId, ctx.user.id),
          eq(pushSubscription.endpoint, input.endpoint),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /push/settings — preferensi notifikasi user (default ON bila belum ada row) */
pushRoute.get("/settings", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select()
      .from(notificationSetting)
      .where(
        and(
          eq(notificationSetting.userId, ctx.user.id),
          eq(notificationSetting.organizationId, ctx.organization.id),
        ),
      );
    return c.json({
      settings: row ?? {
        postPublished: true,
        postFailed: true,
        newComment: true,
        newDm: true,
        newMention: true,
        newReview: true,
      },
      isConfigured: await isVapidConfigured(),
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /push/settings — update preferensi (upsert) */
pushRoute.patch("/settings", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        postPublished: z.boolean().optional(),
        postFailed: z.boolean().optional(),
        newComment: z.boolean().optional(),
        newDm: z.boolean().optional(),
        newMention: z.boolean().optional(),
        newReview: z.boolean().optional(),
      })
      .parse(await c.req.json());

    const where = and(
      eq(notificationSetting.userId, ctx.user.id),
      eq(notificationSetting.organizationId, ctx.organization.id),
    );
    const [existing] = await db
      .select({ id: notificationSetting.id })
      .from(notificationSetting)
      .where(where);

    if (existing) {
      await db.update(notificationSetting).set(input).where(where);
    } else {
      await db.insert(notificationSetting).values({
        id: generateId("notifset"),
        userId: ctx.user.id,
        organizationId: ctx.organization.id,
        ...input,
      });
    }
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /push/test — kirim push test ke device user sendiri */
pushRoute.post("/test", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const sent = await pushToUser(ctx.user.id, {
      title: "Tes notifikasi Sahabat Kreator",
      body: "Notifikasi push berfungsi! Kamu akan menerima update penting di sini.",
      url: "/dashboard",
      tag: "push-test",
    });
    if (sent === 0) {
      return c.json({ message: "Belum ada device aktif — aktifkan notifikasi dulu" }, 400);
    }
    return c.json({ ok: true, sent });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Admin — kelola VAPID keys
// ---------------------------------------------------------------------------

/** POST /push/admin/vapid/generate — generate/rotate VAPID (super admin).
 * Rotate = semua subscription lama invalid → dibersihkan. */
pushRoute.post("/admin/vapid/generate", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const keys = generateVapidKeys();
    const contact = `mailto:${process.env.VAPID_CONTACT_EMAIL ?? "support@sahabatkreator.com"}`;

    const [existing] = await db
      .select({ id: vapidKey.id })
      .from(vapidKey)
      .where(eq(vapidKey.id, "singleton"));

    if (existing) {
      // Rotate: keys berubah → semua subscription lama tidak valid lagi
      await db.delete(pushSubscription);
      await db
        .update(vapidKey)
        .set({
          publicKey: keys.publicKey,
          privateKeyEnc: encrypt(keys.privateKey),
          contact,
        })
        .where(eq(vapidKey.id, "singleton"));
    } else {
      await db.insert(vapidKey).values({
        id: "singleton",
        publicKey: keys.publicKey,
        privateKeyEnc: encrypt(keys.privateKey),
        contact,
      });
    }
    resetVapidCache();
    return c.json({ ok: true, publicKey: keys.publicKey, rotated: Boolean(existing) });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /push/admin/vapid — status VAPID (super admin) */
pushRoute.get("/admin/vapid", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const [row] = await db
      .select({
        publicKey: vapidKey.publicKey,
        contact: vapidKey.contact,
        updatedAt: vapidKey.updatedAt,
      })
      .from(vapidKey)
      .where(eq(vapidKey.id, "singleton"));
    return c.json({ vapid: row ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});
