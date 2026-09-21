// API Goal Tracker — CRUD goal + progres terhitung dari analytics riil

import { db } from "@sahabatkreator/db";
import { goal } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { computeBaseline, GOAL_METRICS, getGoalsWithProgress } from "../lib/goal";
import { generateId } from "../lib/id";

export const goalRoute = new Hono();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

const createGoalSchema = z.object({
  name: z.string().min(1).max(120),
  metric: z.enum(GOAL_METRICS),
  targetValue: z.number().int().min(1).max(1_000_000_000),
  startDate: isoDate,
  endDate: isoDate,
});

/** GET /goals — semua goal + progres */
goalRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const goals = await getGoalsWithProgress(ctx.organization.id);
    return c.json({ goals });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /goals — buat goal (baseline di-snapshot otomatis dari data riil) */
goalRoute.post("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = createGoalSchema.parse(await c.req.json());

    if (input.startDate >= input.endDate) {
      return c.json({ message: "Tanggal selesai harus setelah tanggal mulai" }, 400);
    }
    // Batasi: maksimal 10 goal aktif per org
    const existing = await db
      .select({ id: goal.id, isCompleted: goal.isCompleted })
      .from(goal)
      .where(eq(goal.organizationId, ctx.organization.id));
    if (existing.filter((g) => !g.isCompleted).length >= 10) {
      return c.json({ message: "Maksimal 10 goal aktif" }, 400);
    }

    const baseline = await computeBaseline(ctx.organization.id, input.metric);

    const [row] = await db
      .insert(goal)
      .values({
        id: generateId("goal"),
        organizationId: ctx.organization.id,
        name: input.name,
        metric: input.metric,
        targetValue: input.targetValue,
        baselineValue: baseline,
        startDate: input.startDate,
        endDate: input.endDate,
      })
      .returning();
    return c.json({ goal: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /goals/:id */
goalRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const rows = await db
      .delete(goal)
      .where(and(eq(goal.id, c.req.param("id")), eq(goal.organizationId, ctx.organization.id)))
      .returning({ id: goal.id });
    if (rows.length === 0) return c.json({ message: "Goal tidak ditemukan" }, 404);
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
