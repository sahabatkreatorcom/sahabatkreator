// API Strategi Konten — brand voice, content pillars, caption templates, koleksi hashtag

import { db } from "@sahabatkreator/db";
import {
  brandVoice,
  captionTemplate,
  contentPillar,
  hashtagCollection,
  utmTemplate,
} from "@sahabatkreator/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const strategyRoute = new Hono();

const tagsSchema = z.array(z.string().min(1).max(80)).max(50);

// ---------------------------------------------------------------------------
// Brand voice — satu baris per org
// ---------------------------------------------------------------------------

const brandVoiceSchema = z.object({
  description: z.string().max(2000).nullable().optional(),
  tones: z.array(z.string().min(1).max(60)).max(8).default([]),
  vocabulary: z.array(z.string().min(1).max(80)).max(30).default([]),
  avoid: z.array(z.string().min(1).max(120)).max(20).default([]),
  guidelines: z.string().max(4000).nullable().optional(),
  samples: z.array(z.string().min(1).max(2200)).max(10).default([]),
});

/** GET /strategy/brand-voice */
strategyRoute.get("/brand-voice", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select()
      .from(brandVoice)
      .where(eq(brandVoice.organizationId, ctx.organization.id))
      .limit(1);
    return c.json({ brandVoice: row ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PUT /strategy/brand-voice — upsert (satu per org) */
strategyRoute.put("/brand-voice", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = brandVoiceSchema.parse(await c.req.json());

    const values = {
      description: input.description ?? null,
      tones: input.tones,
      vocabulary: input.vocabulary,
      avoid: input.avoid,
      guidelines: input.guidelines ?? null,
      samples: input.samples,
    };
    const [row] = await db
      .insert(brandVoice)
      .values({ id: generateId("bv"), organizationId: ctx.organization.id, ...values })
      .onConflictDoUpdate({
        target: brandVoice.organizationId,
        set: values,
      })
      .returning();
    return c.json({ brandVoice: row });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Content pillars
// ---------------------------------------------------------------------------

const pillarSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

/** GET /strategy/pillars */
strategyRoute.get("/pillars", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(contentPillar)
      .where(eq(contentPillar.organizationId, ctx.organization.id))
      .orderBy(contentPillar.createdAt);
    return c.json({ pillars: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/pillars */
strategyRoute.post("/pillars", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = pillarSchema.parse(await c.req.json());
    const [row] = await db
      .insert(contentPillar)
      .values({
        id: generateId("cp"),
        organizationId: ctx.organization.id,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
      })
      .returning();
    return c.json({ pillar: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /strategy/pillars/:id */
strategyRoute.patch("/pillars/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = pillarSchema.partial().parse(await c.req.json());
    const [row] = await db
      .update(contentPillar)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      })
      .where(
        and(
          eq(contentPillar.id, c.req.param("id")),
          eq(contentPillar.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Pillar tidak ditemukan" }, 404);
    return c.json({ pillar: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /strategy/pillars/:id */
strategyRoute.delete("/pillars/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(contentPillar)
      .where(
        and(
          eq(contentPillar.id, c.req.param("id")),
          eq(contentPillar.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: contentPillar.id });
    if (rows.length === 0) return c.json({ message: "Pillar tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Caption templates
// ---------------------------------------------------------------------------

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  content: z.string().min(1).max(5000),
  hashtags: tagsSchema.default([]),
  category: z.string().max(60).nullable().optional(),
});

/** GET /strategy/templates */
strategyRoute.get("/templates", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(captionTemplate)
      .where(eq(captionTemplate.organizationId, ctx.organization.id))
      .orderBy(desc(captionTemplate.usageCount), desc(captionTemplate.createdAt));
    return c.json({ templates: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/templates */
strategyRoute.post("/templates", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = templateSchema.parse(await c.req.json());
    const [row] = await db
      .insert(captionTemplate)
      .values({
        id: generateId("ct"),
        organizationId: ctx.organization.id,
        name: input.name,
        content: input.content,
        hashtags: input.hashtags,
        category: input.category ?? null,
        createdBy: ctx.user.id,
      })
      .returning();
    return c.json({ template: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /strategy/templates/:id */
strategyRoute.patch("/templates/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = templateSchema.partial().parse(await c.req.json());
    const [row] = await db
      .update(captionTemplate)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.hashtags !== undefined ? { hashtags: input.hashtags } : {}),
        ...(input.category !== undefined ? { category: input.category ?? null } : {}),
      })
      .where(
        and(
          eq(captionTemplate.id, c.req.param("id")),
          eq(captionTemplate.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Template tidak ditemukan" }, 404);
    return c.json({ template: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /strategy/templates/:id */
strategyRoute.delete("/templates/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(captionTemplate)
      .where(
        and(
          eq(captionTemplate.id, c.req.param("id")),
          eq(captionTemplate.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: captionTemplate.id });
    if (rows.length === 0) return c.json({ message: "Template tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/templates/:id/use — tandai terpakai (usage count naik) */
strategyRoute.post("/templates/:id/use", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .update(captionTemplate)
      .set({ usageCount: sql`${captionTemplate.usageCount} + 1` })
      .where(
        and(
          eq(captionTemplate.id, c.req.param("id")),
          eq(captionTemplate.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Template tidak ditemukan" }, 404);
    return c.json({ template: row });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Hashtag collections
// ---------------------------------------------------------------------------

const collectionSchema = z.object({
  name: z.string().min(1).max(120),
  hashtags: tagsSchema.min(1),
});

/** GET /strategy/hashtag-collections */
strategyRoute.get("/hashtag-collections", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(hashtagCollection)
      .where(eq(hashtagCollection.organizationId, ctx.organization.id))
      .orderBy(desc(hashtagCollection.usageCount), desc(hashtagCollection.createdAt));
    return c.json({ collections: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/hashtag-collections */
strategyRoute.post("/hashtag-collections", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = collectionSchema.parse(await c.req.json());
    const [row] = await db
      .insert(hashtagCollection)
      .values({
        id: generateId("hc"),
        organizationId: ctx.organization.id,
        name: input.name,
        hashtags: input.hashtags.map((t) => t.replace(/^#/, "")),
      })
      .returning();
    return c.json({ collection: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /strategy/hashtag-collections/:id */
strategyRoute.patch("/hashtag-collections/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = collectionSchema.partial().parse(await c.req.json());
    const [row] = await db
      .update(hashtagCollection)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.hashtags !== undefined
          ? { hashtags: input.hashtags.map((t) => t.replace(/^#/, "")) }
          : {}),
      })
      .where(
        and(
          eq(hashtagCollection.id, c.req.param("id")),
          eq(hashtagCollection.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Koleksi tidak ditemukan" }, 404);
    return c.json({ collection: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /strategy/hashtag-collections/:id */
strategyRoute.delete("/hashtag-collections/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(hashtagCollection)
      .where(
        and(
          eq(hashtagCollection.id, c.req.param("id")),
          eq(hashtagCollection.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: hashtagCollection.id });
    if (rows.length === 0) return c.json({ message: "Koleksi tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/hashtag-collections/:id/use — tandai terpakai */
strategyRoute.post("/hashtag-collections/:id/use", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .update(hashtagCollection)
      .set({ usageCount: sql`${hashtagCollection.usageCount} + 1` })
      .where(
        and(
          eq(hashtagCollection.id, c.req.param("id")),
          eq(hashtagCollection.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Koleksi tidak ditemukan" }, 404);
    return c.json({ collection: row });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// UTM templates
// ---------------------------------------------------------------------------

const utmTemplateSchema = z.object({
  name: z.string().min(1).max(120),
  source: z.string().min(1).max(80),
  medium: z.string().min(1).max(80),
  campaign: z.string().min(1).max(120),
  term: z.string().max(120).nullable().optional(),
  content: z.string().max(120).nullable().optional(),
});

/** GET /strategy/utm-templates */
strategyRoute.get("/utm-templates", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(utmTemplate)
      .where(eq(utmTemplate.organizationId, ctx.organization.id))
      .orderBy(desc(utmTemplate.usageCount), desc(utmTemplate.createdAt));
    return c.json({ templates: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/utm-templates */
strategyRoute.post("/utm-templates", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = utmTemplateSchema.parse(await c.req.json());
    const [row] = await db
      .insert(utmTemplate)
      .values({
        id: generateId("utm"),
        organizationId: ctx.organization.id,
        name: input.name,
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
        term: input.term ?? null,
        content: input.content ?? null,
      })
      .returning();
    return c.json({ template: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /strategy/utm-templates/:id */
strategyRoute.delete("/utm-templates/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(utmTemplate)
      .where(
        and(
          eq(utmTemplate.id, c.req.param("id")),
          eq(utmTemplate.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: utmTemplate.id });
    if (rows.length === 0) return c.json({ message: "Template UTM tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /strategy/utm-templates/:id/use — tandai terpakai */
strategyRoute.post("/utm-templates/:id/use", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .update(utmTemplate)
      .set({ usageCount: sql`${utmTemplate.usageCount} + 1` })
      .where(
        and(
          eq(utmTemplate.id, c.req.param("id")),
          eq(utmTemplate.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Template UTM tidak ditemukan" }, 404);
    return c.json({ template: row });
  } catch (error) {
    return errorResponse(error);
  }
});
