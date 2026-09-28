// API Holiday — rekomendasi konten hari besar Indonesia & internasional
// GET /holiday/upcoming?days=14 — hari besar dalam N hari ke depan
// GET /holiday?month=&category=&scope= — kalender lengkap (filter opsional)

import { db } from "@sahabatkreator/db";
import { holiday } from "@sahabatkreator/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { errorResponse, requireOrg } from "../lib/auth-guard";

export const holidayRoute = new Hono();

/** Jarak hari (month/day) ke hari ini, 0-365. Recurring tahunan. */
function daysUntil(month: number, day: number, now: Date): number {
  const thisYear = now.getFullYear();
  const target = new Date(thisYear, month - 1, day);
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  let diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) diff += 365; // sudah lewat tahun ini → tahun depan
  return diff;
}

/**
 * GET /holiday/upcoming — hari besar mendatang + yang sedang berjalan.
 * Query: days (default 30) — rentang prediksi ke depan.
 */
holidayRoute.get("/upcoming", async (c) => {
  try {
    await requireOrg(c);
    const days = Math.min(Number(c.req.query("days") ?? 30) || 30, 120);
    const now = new Date();

    const rows = await db.select().from(holiday).where(eq(holiday.isActive, true));

    const upcoming = rows
      .map((h) => ({ ...h, daysUntil: daysUntil(h.month, h.day, now) }))
      .filter((h) => h.daysUntil <= days)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 20);

    return c.json({ holidays: upcoming });
  } catch (err) {
    return errorResponse(err);
  }
});

/**
 * GET /holiday — kalender hari besar (filter opsional).
 * Query: month (1-12), scope (national|international), category.
 */
holidayRoute.get("/", async (c) => {
  try {
    await requireOrg(c);
    const month = Number(c.req.query("month"));
    const scope = c.req.query("scope");
    const category = c.req.query("category");

    const conditions = [eq(holiday.isActive, true)];
    if (month >= 1 && month <= 12) conditions.push(eq(holiday.month, month));
    if (scope === "national" || scope === "international") {
      conditions.push(eq(holiday.scope, scope));
    }
    if (category) conditions.push(eq(holiday.category, category));

    const rows = await db
      .select()
      .from(holiday)
      .where(and(...conditions))
      .orderBy(asc(holiday.month), asc(holiday.day));

    return c.json({ holidays: rows });
  } catch (err) {
    return errorResponse(err);
  }
});
