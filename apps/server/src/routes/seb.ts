// API SEB — AI coach proaktif: chat multi-sesi, report, rekomendasi,
// experiment, brand knowledge, impact check, dan platform knowledge (admin).

import {
  approveSebPendingInsights,
  chatWithSeb,
  checkSebRecommendationImpact,
  db,
  generateSebReport,
  normalizeWebsiteUrl,
  SEB_EXPERIMENT_STATUSES,
  SEB_PRIORITIES,
  SEB_RECOMMENDATION_STATUSES,
  scanWebsiteForSebBrandKnowledge,
} from "@sahabatkreator/db";
import {
  platformEnum,
  sebBrandKnowledge,
  sebChatMessage,
  sebChatSession,
  sebExperiment,
  sebPlatformKnowledge,
  sebRecommendation,
  sebReport,
} from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  errorResponse,
  requireOrg,
  requireOrgAdmin,
  requirePlatformAdmin,
} from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const sebRoute = new Hono();

const platformValues = platformEnum.enumValues as [string, ...string[]];
const platformSchema = z.enum(platformValues as [string, ...string[]] as never);

// ---------------------------------------------------------------------------
// Overview — ringkasan SEB untuk dashboard
// ---------------------------------------------------------------------------

/** GET /seb/overview */
sebRoute.get("/overview", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const orgId = ctx.organization.id;

    const [latestReport] = await db
      .select()
      .from(sebReport)
      .where(and(eq(sebReport.organizationId, orgId), eq(sebReport.status, "completed")))
      .orderBy(desc(sebReport.createdAt))
      .limit(1);

    const recommendations = await db
      .select()
      .from(sebRecommendation)
      .where(eq(sebRecommendation.organizationId, orgId))
      .orderBy(desc(sebRecommendation.createdAt))
      .limit(50);

    const experiments = await db
      .select()
      .from(sebExperiment)
      .where(eq(sebExperiment.organizationId, orgId))
      .orderBy(desc(sebExperiment.createdAt))
      .limit(20);

    const [knowledge] = await db
      .select()
      .from(sebBrandKnowledge)
      .where(eq(sebBrandKnowledge.organizationId, orgId))
      .limit(1);

    return c.json({
      latestReport: latestReport ?? null,
      recommendations,
      experiments,
      brandKnowledge: knowledge ?? null,
      counts: {
        openRecommendations: recommendations.filter(
          (r) => r.status === "new" || r.status === "in_progress",
        ).length,
        highPriority: recommendations.filter(
          (r) => r.priority === "high" && r.status !== "done" && r.status !== "dismissed",
        ).length,
        activeExperiments: experiments.filter(
          (e) => e.status === "running" || e.status === "planned",
        ).length,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** GET /seb/reports */
sebRoute.get("/reports", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(sebReport)
      .where(eq(sebReport.organizationId, ctx.organization.id))
      .orderBy(desc(sebReport.createdAt))
      .limit(30);
    return c.json({ reports: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /seb/reports/:id — detail + rekomendasi + experiment */
sebRoute.get("/reports/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [report] = await db
      .select()
      .from(sebReport)
      .where(
        and(eq(sebReport.id, c.req.param("id")), eq(sebReport.organizationId, ctx.organization.id)),
      )
      .limit(1);
    if (!report) return c.json({ message: "Report tidak ditemukan" }, 404);

    const recommendations = await db
      .select()
      .from(sebRecommendation)
      .where(eq(sebRecommendation.reportId, report.id))
      .orderBy(sebRecommendation.createdAt);
    const experiments = await db
      .select()
      .from(sebExperiment)
      .where(eq(sebExperiment.reportId, report.id))
      .orderBy(sebExperiment.createdAt);

    return c.json({ report, recommendations, experiments });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/reports — generate report baru (manual trigger) */
sebRoute.post("/reports", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const report = await generateSebReport({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      trigger: "manual",
    });
    return c.json({ report }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Rekomendasi
// ---------------------------------------------------------------------------

const recommendationStatusSchema = z.enum(
  SEB_RECOMMENDATION_STATUSES as unknown as [string, ...string[]],
);

/** GET /seb/recommendations */
sebRoute.get("/recommendations", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const status = c.req.query("status");
    const priority = c.req.query("priority");

    const conditions = [eq(sebRecommendation.organizationId, ctx.organization.id)];
    if (status && (SEB_RECOMMENDATION_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(sebRecommendation.status, status));
    }
    if (priority && (SEB_PRIORITIES as readonly string[]).includes(priority)) {
      conditions.push(eq(sebRecommendation.priority, priority));
    }

    const rows = await db
      .select()
      .from(sebRecommendation)
      .where(and(...conditions))
      .orderBy(desc(sebRecommendation.createdAt))
      .limit(100);
    return c.json({ recommendations: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /seb/recommendations/:id — update status workflow */
sebRoute.patch("/recommendations/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        status: recommendationStatusSchema.optional(),
      })
      .parse(await c.req.json());

    const now = new Date();
    const [row] = await db
      .update(sebRecommendation)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.status === "done" ? { completedAt: now } : {}),
        ...(input.status !== undefined && input.status !== "done" ? { completedAt: null } : {}),
      })
      .where(
        and(
          eq(sebRecommendation.id, c.req.param("id")),
          eq(sebRecommendation.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Rekomendasi tidak ditemukan" }, 404);
    return c.json({ recommendation: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/recommendations/:id/impact-check — ukur dampak before/after */
sebRoute.post("/recommendations/:id/impact-check", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const result = await checkSebRecommendationImpact(ctx.organization.id, c.req.param("id"));
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

const experimentStatusSchema = z.enum(SEB_EXPERIMENT_STATUSES as unknown as [string, ...string[]]);

const experimentSchema = z.object({
  title: z.string().min(1).max(200),
  hypothesis: z.string().min(1).max(2000),
  platform: platformSchema.optional().nullable(),
  metric: z.string().min(1).max(60).default("engagement_rate"),
  reportId: z.string().optional().nullable(),
});

/** GET /seb/experiments */
sebRoute.get("/experiments", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(sebExperiment)
      .where(eq(sebExperiment.organizationId, ctx.organization.id))
      .orderBy(desc(sebExperiment.createdAt));
    return c.json({ experiments: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/experiments — buat experiment manual */
sebRoute.post("/experiments", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = experimentSchema.parse(await c.req.json());
    const [row] = await db
      .insert(sebExperiment)
      .values({
        id: generateId("sebexp"),
        organizationId: ctx.organization.id,
        reportId: input.reportId ?? null,
        title: input.title,
        hypothesis: input.hypothesis,
        platform: (input.platform ?? null) as never,
        metric: input.metric,
      })
      .returning();
    return c.json({ experiment: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /seb/experiments/:id — update status / hasil */
sebRoute.patch("/experiments/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        status: experimentStatusSchema.optional(),
        startAt: z.string().datetime().nullable().optional(),
        endAt: z.string().datetime().nullable().optional(),
        result: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(await c.req.json());

    const [row] = await db
      .update(sebExperiment)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.startAt !== undefined
          ? { startAt: input.startAt ? new Date(input.startAt) : null }
          : {}),
        ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
        ...(input.result !== undefined ? { result: input.result } : {}),
      })
      .where(
        and(
          eq(sebExperiment.id, c.req.param("id")),
          eq(sebExperiment.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Experiment tidak ditemukan" }, 404);
    return c.json({ experiment: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /seb/experiments/:id */
sebRoute.delete("/experiments/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(sebExperiment)
      .where(
        and(
          eq(sebExperiment.id, c.req.param("id")),
          eq(sebExperiment.organizationId, ctx.organization.id),
        ),
      )
      .returning({ id: sebExperiment.id });
    if (rows.length === 0) return c.json({ message: "Experiment tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Brand knowledge
// ---------------------------------------------------------------------------

/** GET /seb/brand-knowledge */
sebRoute.get("/brand-knowledge", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select()
      .from(sebBrandKnowledge)
      .where(eq(sebBrandKnowledge.organizationId, ctx.organization.id))
      .limit(1);
    return c.json({ brandKnowledge: row ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PUT /seb/brand-knowledge — upsert field manual */
sebRoute.put("/brand-knowledge", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        websiteUrl: z.string().max(500).nullable().optional(),
        audience: z.string().max(2000).nullable().optional(),
        positioning: z.string().max(2000).nullable().optional(),
        products: z.string().max(2000).nullable().optional(),
        offers: z.string().max(2000).nullable().optional(),
        voiceRules: z.string().max(2000).nullable().optional(),
        bannedTopics: z.string().max(2000).nullable().optional(),
        learnedInsights: z.array(z.string().min(1).max(300)).max(50).optional(),
      })
      .parse(await c.req.json());

    const values = {
      websiteUrl: input.websiteUrl ?? null,
      audience: input.audience ?? null,
      positioning: input.positioning ?? null,
      products: input.products ?? null,
      offers: input.offers ?? null,
      voiceRules: input.voiceRules ?? null,
      bannedTopics: input.bannedTopics ?? null,
      learnedInsights: input.learnedInsights ?? [],
    };
    const [row] = await db
      .insert(sebBrandKnowledge)
      .values({ id: generateId("sebbk"), organizationId: ctx.organization.id, ...values })
      .onConflictDoUpdate({
        target: sebBrandKnowledge.organizationId,
        set: values,
      })
      .returning();
    return c.json({ brandKnowledge: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/brand-knowledge/scan-website — crawl website + ekstrak insight (pending) */
sebRoute.post("/brand-knowledge/scan-website", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const input = z.object({ websiteUrl: z.string().min(1).max(500) }).parse(await c.req.json());

    const url = normalizeWebsiteUrl(input.websiteUrl);
    const result = await scanWebsiteForSebBrandKnowledge({
      organizationId: ctx.organization.id,
      websiteUrl: url.toString(),
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/brand-knowledge/approve — setujui pendingInsights jadi field aktif */
sebRoute.post("/brand-knowledge/approve", async (c) => {
  try {
    const ctx = await requireOrgAdmin(c);
    const flags = z
      .object({
        audience: z.boolean().optional(),
        positioning: z.boolean().optional(),
        products: z.boolean().optional(),
        offers: z.boolean().optional(),
        voiceRules: z.boolean().optional(),
        bannedTopics: z.boolean().optional(),
        learnedInsights: z.boolean().optional(),
      })
      .default({})
      .parse(await c.req.json().catch(() => ({})));

    const [knowledge] = await db
      .select()
      .from(sebBrandKnowledge)
      .where(eq(sebBrandKnowledge.organizationId, ctx.organization.id))
      .limit(1);
    if (!knowledge) return c.json({ message: "Brand knowledge belum ada" }, 404);

    const pending = (knowledge.pendingInsights ?? {}) as Record<string, unknown>;
    const pendingStr = (key: string): string | undefined => {
      const value = pending[key];
      return typeof value === "string" && value.trim() ? value : undefined;
    };
    const pendingInsights = Array.isArray(pending.learnedInsights)
      ? (pending.learnedInsights as unknown[]).filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        )
      : undefined;

    await approveSebPendingInsights({
      organizationId: ctx.organization.id,
      fields: {
        ...(flags.audience ? { audience: pendingStr("audience") } : {}),
        ...(flags.positioning ? { positioning: pendingStr("positioning") } : {}),
        ...(flags.products ? { products: pendingStr("products") } : {}),
        ...(flags.offers ? { offers: pendingStr("offers") } : {}),
        ...(flags.voiceRules ? { voiceRules: pendingStr("voiceRules") } : {}),
        ...(flags.bannedTopics ? { bannedTopics: pendingStr("bannedTopics") } : {}),
        ...(flags.learnedInsights ? { learnedInsights: pendingInsights ?? [] } : {}),
      },
    });

    const [updated] = await db
      .select()
      .from(sebBrandKnowledge)
      .where(eq(sebBrandKnowledge.organizationId, ctx.organization.id))
      .limit(1);
    return c.json({ brandKnowledge: updated ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Chat multi-sesi
// ---------------------------------------------------------------------------

/** GET /seb/chat/sessions */
sebRoute.get("/chat/sessions", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .select()
      .from(sebChatSession)
      .where(eq(sebChatSession.organizationId, ctx.organization.id))
      .orderBy(desc(sebChatSession.updatedAt))
      .limit(50);
    return c.json({ sessions: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/chat/sessions — buat sesi baru */
sebRoute.post("/chat/sessions", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .insert(sebChatSession)
      .values({
        id: generateId("sebcs"),
        organizationId: ctx.organization.id,
        userId: ctx.user.id,
        title: "Chat SEB",
      })
      .returning();
    return c.json({ session: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /seb/chat/sessions/:id/messages */
sebRoute.get("/chat/sessions/:id/messages", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [session] = await db
      .select({ id: sebChatSession.id })
      .from(sebChatSession)
      .where(
        and(
          eq(sebChatSession.id, c.req.param("id")),
          eq(sebChatSession.organizationId, ctx.organization.id),
          eq(sebChatSession.userId, ctx.user.id),
        ),
      )
      .limit(1);
    if (!session) return c.json({ message: "Sesi chat tidak ditemukan" }, 404);

    const rows = await db
      .select()
      .from(sebChatMessage)
      .where(eq(sebChatMessage.sessionId, session.id))
      .orderBy(sebChatMessage.createdAt);
    return c.json({ messages: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/chat — kirim pesan ke SEB */
sebRoute.post("/chat", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        sessionId: z.string().min(1).optional(),
        message: z.string().min(1).max(4000),
      })
      .parse(await c.req.json());

    const result = await chatWithSeb({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      sessionId: input.sessionId,
      message: input.message,
    });
    return c.json(result);
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /seb/chat/sessions/:id */
sebRoute.delete("/chat/sessions/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(sebChatSession)
      .where(
        and(
          eq(sebChatSession.id, c.req.param("id")),
          eq(sebChatSession.organizationId, ctx.organization.id),
          eq(sebChatSession.userId, ctx.user.id),
        ),
      )
      .returning({ id: sebChatSession.id });
    if (rows.length === 0) return c.json({ message: "Sesi chat tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Platform knowledge (super admin platform)
// ---------------------------------------------------------------------------

const knowledgeSchema = z.object({
  platform: platformSchema,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  sourceUrl: z.string().max(500).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  isActive: z.boolean().default(true),
});

/** GET /seb/platform-knowledge — admin: daftar knowledge */
sebRoute.get("/platform-knowledge", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const rows = await db
      .select()
      .from(sebPlatformKnowledge)
      .orderBy(desc(sebPlatformKnowledge.createdAt));
    return c.json({ knowledge: rows });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /seb/platform-knowledge — admin: tambah */
sebRoute.post("/platform-knowledge", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const input = knowledgeSchema.parse(await c.req.json());
    const [row] = await db
      .insert(sebPlatformKnowledge)
      .values({
        id: generateId("sebpk"),
        platform: input.platform as never,
        title: input.title,
        content: input.content,
        sourceUrl: input.sourceUrl ?? null,
        confidence: input.confidence,
        isActive: input.isActive,
      })
      .returning();
    return c.json({ knowledge: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /seb/platform-knowledge/:id — admin: update */
sebRoute.patch("/platform-knowledge/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const input = knowledgeSchema.partial().parse(await c.req.json());
    const [row] = await db
      .update(sebPlatformKnowledge)
      .set({
        ...(input.platform !== undefined ? { platform: input.platform as never } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl ?? null } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      .where(eq(sebPlatformKnowledge.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ message: "Knowledge tidak ditemukan" }, 404);
    return c.json({ knowledge: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /seb/platform-knowledge/:id — admin: hapus */
sebRoute.delete("/platform-knowledge/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const rows = await db
      .delete(sebPlatformKnowledge)
      .where(eq(sebPlatformKnowledge.id, c.req.param("id")))
      .returning({ id: sebPlatformKnowledge.id });
    if (rows.length === 0) return c.json({ message: "Knowledge tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
