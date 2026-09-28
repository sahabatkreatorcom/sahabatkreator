// Webhook endpoint CRUD (session) — konfigurasi webhook keluar org.
//
// Tidak terpapar di /v1 (dibuat/dikelola via UI, sama seperti api-keys).
// Gate: api_webhook (Enterprise) — checkPlanFeature per-handler.
import { db } from "@sahabatkreator/db";
import {
  isWebhookEvent,
  WEBHOOK_EVENTS,
  type WebhookEvent,
  webhookDelivery,
  webhookEndpoint,
} from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg, requireOrgAdmin } from "../lib/auth-guard";
import { checkPlanFeature } from "../lib/billing";
import { encrypt } from "../lib/crypto";
import { generateId } from "../lib/id";
import { assertSafeExternalUrl, UnsafeUrlError } from "../lib/ssrf";

export const webhookEndpointRoute = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(2048),
  secret: z.string().min(16).max(256),
  events: z.array(z.string().min(1)).min(1).max(20),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().max(2048).optional(),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.string().min(1)).min(1).max(20).optional(),
});

/** Strip secret — tidak pernah dikembalikan ke klien. */
function stripSecret(row: typeof webhookEndpoint.$inferSelect) {
  const { secretEnc: _secret, ...rest } = row;
  return rest;
}

/** GET /webhook-endpoints — daftar endpoint org. */
webhookEndpointRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");

    const endpoints = await db
      .select()
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.organizationId, ctx.organization.id))
      .orderBy(desc(webhookEndpoint.createdAt));

    return c.json({ endpoints: endpoints.map(stripSecret) });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /webhook-endpoints/events — daftar event yang tersedia (untuk UI). */
webhookEndpointRoute.get("/events", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");
    return c.json({ events: WEBHOOK_EVENTS });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /webhook-endpoints/deliveries — audit pengiriman seluruh org (untuk UI). */
webhookEndpointRoute.get("/deliveries", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");

    const deliveries = await db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.organizationId, ctx.organization.id))
      .orderBy(desc(webhookDelivery.createdAt))
      .limit(50);

    return c.json({ deliveries });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /webhook-endpoints — buat endpoint. */
webhookEndpointRoute.post("/", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");

    const input = createSchema.parse(await c.req.json());

    const invalidEvents = input.events.filter((e) => !isWebhookEvent(e));
    if (invalidEvents.length > 0) {
      return c.json({ message: `Event tidak dikenal: ${invalidEvents.join(", ")}` }, 400);
    }

    // SSRF guard wajib — URL user-controlled
    try {
      await assertSafeExternalUrl(input.url);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return c.json({ message: e.message }, 400);
      throw e;
    }

    const id = generateId("wh");
    await db.insert(webhookEndpoint).values({
      id,
      organizationId: ctx.organization.id,
      name: input.name,
      url: input.url,
      secretEnc: encrypt(input.secret),
      events: input.events as WebhookEvent[],
    });

    const [created] = await db
      .select()
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, id))
      .limit(1);
    if (!created) return c.json({ message: "Endpoint gagal disimpan" }, 500);
    return c.json({ endpoint: stripSecret(created) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /webhook-endpoints/:id — ubah endpoint (semua field opsional). */
webhookEndpointRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");

    const [existing] = await db
      .select()
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.id, c.req.param("id")),
          eq(webhookEndpoint.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!existing) return c.json({ message: "Endpoint tidak ditemukan" }, 404);

    const input = updateSchema.parse(await c.req.json());

    if (input.events) {
      const invalidEvents = input.events.filter((e) => !isWebhookEvent(e));
      if (invalidEvents.length > 0) {
        return c.json({ message: `Event tidak dikenal: ${invalidEvents.join(", ")}` }, 400);
      }
    }

    if (input.url) {
      try {
        await assertSafeExternalUrl(input.url);
      } catch (e) {
        if (e instanceof UnsafeUrlError) return c.json({ message: e.message }, 400);
        throw e;
      }
    }

    await db
      .update(webhookEndpoint)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.url && { url: input.url }),
        ...(input.events && { events: input.events as WebhookEvent[] }),
        ...(input.secret && { secretEnc: encrypt(input.secret) }),
      })
      .where(eq(webhookEndpoint.id, existing.id));

    const [updated] = await db
      .select()
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, existing.id))
      .limit(1);
    if (!updated) return c.json({ message: "Endpoint gagal disimpan" }, 500);
    return c.json({ endpoint: stripSecret(updated) });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /webhook-endpoints/:id — revoke (soft delete). */
webhookEndpointRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");

    const [existing] = await db
      .select()
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.id, c.req.param("id")),
          eq(webhookEndpoint.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!existing) return c.json({ message: "Endpoint tidak ditemukan" }, 404);

    await db
      .update(webhookEndpoint)
      .set({ revokedAt: new Date(), isActive: false })
      .where(eq(webhookEndpoint.id, existing.id));

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /webhook-endpoints/:id/deliveries — audit pengiriman terakhir. */
webhookEndpointRoute.get("/:id/deliveries", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkPlanFeature(ctx.organization.id, "api_webhook");

    const [existing] = await db
      .select({ id: webhookEndpoint.id })
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.id, c.req.param("id")),
          eq(webhookEndpoint.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!existing) return c.json({ message: "Endpoint tidak ditemukan" }, 404);

    const deliveries = await db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.endpointId, existing.id))
      .orderBy(desc(webhookDelivery.createdAt))
      .limit(50);

    return c.json({ deliveries });
  } catch (error) {
    return errorResponse(error);
  }
});
