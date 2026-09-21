// API Social Listening — monitor keyword, hasil listening, sumber web

import { db } from "@sahabatkreator/db";
import { listeningItem, listeningMonitor, listeningSource } from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";
import { getListeningSummary, syncAllMonitors, syncMonitor } from "../lib/listening";

export const listeningRoute = new Hono();

/** GET /listening — ringkasan + monitor + hasil terbaru */
listeningRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const monitorId = c.req.query("monitorId");

    const summary = await getListeningSummary(ctx.organization.id);

    const monitors = await db
      .select()
      .from(listeningMonitor)
      .where(eq(listeningMonitor.organizationId, ctx.organization.id))
      .orderBy(desc(listeningMonitor.createdAt));

    const conditions = [eq(listeningItem.organizationId, ctx.organization.id)];
    if (monitorId) conditions.push(eq(listeningItem.monitorId, monitorId));

    const items = await db
      .select({
        id: listeningItem.id,
        monitorId: listeningItem.monitorId,
        sourceType: listeningItem.sourceType,
        platform: listeningItem.platform,
        externalUrl: listeningItem.externalUrl,
        authorName: listeningItem.authorName,
        authorAvatarUrl: listeningItem.authorAvatarUrl,
        content: listeningItem.content,
        sentiment: listeningItem.sentiment,
        matchedKeywords: listeningItem.matchedKeywords,
        isRead: listeningItem.isRead,
        occurredAt: listeningItem.occurredAt,
      })
      .from(listeningItem)
      .where(and(...conditions))
      .orderBy(desc(listeningItem.occurredAt))
      .limit(75);

    return c.json({ summary, monitors, items });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Monitor CRUD ----------

const monitorSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().min(1).max(100)).min(1).max(20),
  excludedTerms: z.array(z.string().min(1).max(100)).max(20).default([]),
  platforms: z.array(z.string().max(50)).max(11).default([]),
  isActive: z.boolean().default(true),
});

listeningRoute.post("/monitors", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = monitorSchema.parse(await c.req.json());

    const id = generateId("lsn");
    await db.insert(listeningMonitor).values({
      id,
      organizationId: ctx.organization.id,
      name: input.name,
      keywords: input.keywords,
      excludedTerms: input.excludedTerms,
      platforms: input.platforms,
      isActive: input.isActive,
    });

    // Sync pertama langsung agar hasil muncul cepat
    // TODO(performance): sync dijalankan sinkron karena frontend membaca hasil
    // (newItems) di response. Jika jadi lambat, ubah jadi fire-and-forget
    // (job queue + response 202) dan tampilkan progres via polling/websocket.
    const result = await syncMonitor(id);
    return c.json({ id, newItems: result.newItems }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

listeningRoute.patch("/monitors/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = monitorSchema.partial().parse(await c.req.json());

    const [row] = await db
      .select({ id: listeningMonitor.id })
      .from(listeningMonitor)
      .where(
        and(
          eq(listeningMonitor.id, c.req.param("id")),
          eq(listeningMonitor.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Monitor tidak ditemukan" }, 404);

    await db
      .update(listeningMonitor)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
        ...(input.excludedTerms !== undefined ? { excludedTerms: input.excludedTerms } : {}),
        ...(input.platforms !== undefined ? { platforms: input.platforms } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      .where(eq(listeningMonitor.id, row.id));

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

listeningRoute.delete("/monitors/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .delete(listeningMonitor)
      .where(
        and(
          eq(listeningMonitor.id, c.req.param("id")),
          eq(listeningMonitor.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Sync ----------

/** POST /listening/sync — sync semua monitor aktif org */
listeningRoute.post("/sync", async (c) => {
  try {
    const ctx = await requireOrg(c);
    // TODO(performance): sync dijalankan sinkron karena frontend membaca hasil
    // (newItems/results) di response. Jika jadi lambat, ubah jadi fire-and-forget
    // (job queue + response 202) dan tampilkan progres via polling/websocket.
    const results = await syncAllMonitors(ctx.organization.id);
    const newItems = results.reduce((sum, r) => sum + r.newItems, 0);
    return c.json({ ok: true, newItems, results });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Item: mark read ----------

/** POST /listening/items/:id/read */
listeningRoute.post("/items/:id/read", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .update(listeningItem)
      .set({ isRead: true })
      .where(
        and(
          eq(listeningItem.id, c.req.param("id")),
          eq(listeningItem.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /listening/items/read-all */
listeningRoute.post("/items/read-all", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .update(listeningItem)
      .set({ isRead: true })
      .where(eq(listeningItem.organizationId, ctx.organization.id));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- Sumber web (crawler) ----------

const sourceSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(500),
  sourceType: z.enum(["auto", "rss", "page"]).default("auto"),
});

listeningRoute.get("/sources", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const sources = await db
      .select()
      .from(listeningSource)
      .where(eq(listeningSource.organizationId, ctx.organization.id))
      .orderBy(desc(listeningSource.createdAt));
    return c.json({ sources });
  } catch (error) {
    return errorResponse(error);
  }
});

listeningRoute.post("/sources", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = sourceSchema.parse(await c.req.json());

    // Batasi jumlah sumber per org (crawling mahal)
    const existing = await db
      .select({ id: listeningSource.id })
      .from(listeningSource)
      .where(eq(listeningSource.organizationId, ctx.organization.id));
    if (existing.length >= 15) {
      return c.json({ message: "Maksimal 15 sumber web per organisasi." }, 400);
    }

    const id = generateId("lss");
    await db.insert(listeningSource).values({
      id,
      organizationId: ctx.organization.id,
      name: input.name,
      url: input.url,
      sourceType: input.sourceType,
    });
    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

listeningRoute.delete("/sources/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .delete(listeningSource)
      .where(
        and(
          eq(listeningSource.id, c.req.param("id")),
          eq(listeningSource.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
