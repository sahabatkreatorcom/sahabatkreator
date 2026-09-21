// API Competitor Intelligence — CRUD kompetitor + benchmark

import { db } from "@sahabatkreator/db";
import { competitor } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { getCompetitorBenchmark } from "../lib/competitor";
import { generateId } from "../lib/id";

export const competitorRoute = new Hono();

/** GET /competitors — daftar + benchmark vs performa org */
competitorRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const data = await getCompetitorBenchmark(ctx.organization.id);
    return c.json(data);
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------- CRUD ----------

const competitorSchema = z.object({
  platform: z.enum([
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "pinterest",
    "linkedin",
    "threads",
  ]),
  username: z.string().min(1).max(100),
  displayName: z.string().max(200).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  followers: z.number().int().min(0).max(1_000_000_000),
  /** Engagement rate % dengan 2 desimal — dikonversi ke basis point (x100) */
  avgEngagementRate: z.number().min(0).max(100).optional(),
  postsPerWeek: z.number().int().min(0).max(100).optional(),
  isVerified: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

competitorRoute.post("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = competitorSchema.parse(await c.req.json());

    // Batasi jumlah kompetitor per org
    const existing = await db
      .select({ id: competitor.id })
      .from(competitor)
      .where(eq(competitor.organizationId, ctx.organization.id));
    if (existing.length >= 20) {
      return c.json({ message: "Maksimal 20 kompetitor per organisasi." }, 400);
    }

    const username = input.username.replace(/^@/, "").trim();
    const id = generateId("cpt");
    await db.insert(competitor).values({
      id,
      organizationId: ctx.organization.id,
      platform: input.platform,
      username,
      displayName: input.displayName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      followers: input.followers,
      avgEngagementRateBp:
        input.avgEngagementRate != null ? Math.round(input.avgEngagementRate * 100) : null,
      postsPerWeek: input.postsPerWeek ?? null,
      isVerified: input.isVerified,
      notes: input.notes ?? null,
      lastUpdatedBy: ctx.user.id,
    });
    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

competitorRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = competitorSchema.partial().parse(await c.req.json());

    const [row] = await db
      .select()
      .from(competitor)
      .where(
        and(
          eq(competitor.id, c.req.param("id")),
          eq(competitor.organizationId, ctx.organization.id),
        ),
      )
      .limit(1);
    if (!row) return c.json({ message: "Kompetitor tidak ditemukan" }, 404);

    // Update snapshot history: simpan kondisi lama sebelum perubahan
    const history = [...(row.engagementHistory ?? [])];
    const today = new Date().toISOString().slice(0, 10);
    const lastSnapshot = history[history.length - 1];
    if (!lastSnapshot || lastSnapshot.date !== today) {
      history.push({
        date: today,
        followers: input.followers ?? row.followers,
        engagementRate:
          input.avgEngagementRate != null
            ? input.avgEngagementRate
            : row.avgEngagementRateBp != null
              ? row.avgEngagementRateBp / 100
              : 0,
      });
      // simpan max 30 snapshot
      while (history.length > 30) history.shift();
    }

    await db
      .update(competitor)
      .set({
        ...(input.username !== undefined
          ? { username: input.username.replace(/^@/, "").trim() }
          : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.followers !== undefined ? { followers: input.followers } : {}),
        ...(input.avgEngagementRate !== undefined
          ? { avgEngagementRateBp: Math.round(input.avgEngagementRate * 100) }
          : {}),
        ...(input.postsPerWeek !== undefined ? { postsPerWeek: input.postsPerWeek } : {}),
        ...(input.isVerified !== undefined ? { isVerified: input.isVerified } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        engagementHistory: history,
        lastUpdatedBy: ctx.user.id,
      })
      .where(eq(competitor.id, row.id));

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

competitorRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .delete(competitor)
      .where(
        and(
          eq(competitor.id, c.req.param("id")),
          eq(competitor.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
