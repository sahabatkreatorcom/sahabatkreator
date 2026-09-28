// API Calendar — notes pada kalender konten

import { db } from "@sahabatkreator/db";
import { calendarNote } from "@sahabatkreator/db/schema";
import { and, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const calendarRoute = new Hono();

/** GET /calendar/notes?from=&to= — notes dalam rentang tanggal */
calendarRoute.get("/notes", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const from = c.req.query("from");
    const to = c.req.query("to");

    const conditions = [eq(calendarNote.organizationId, ctx.organization.id)];
    if (from) conditions.push(gte(calendarNote.date, new Date(from)));
    if (to) conditions.push(lt(calendarNote.date, new Date(to)));

    const notes = await db
      .select()
      .from(calendarNote)
      .where(and(...conditions))
      .orderBy(calendarNote.date);
    return c.json({ notes });
  } catch (error) {
    return errorResponse(error);
  }
});

const noteSchema = z.object({
  date: z.string().min(1),
  title: z.string().min(1).max(200),
  content: z.string().max(2000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

/** POST /calendar/notes — tambah note */
calendarRoute.post("/notes", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = noteSchema.parse(await c.req.json());
    const id = generateId("note");
    await db.insert(calendarNote).values({
      id,
      organizationId: ctx.organization.id,
      date: new Date(input.date),
      title: input.title,
      content: input.content ?? null,
      color: input.color ?? null,
    });
    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /calendar/notes/:id — edit note */
calendarRoute.patch("/notes/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = noteSchema
      .partial()
      .omit({ date: true })
      .parse(await c.req.json());
    const [row] = await db
      .update(calendarNote)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content ?? null } : {}),
        ...(input.color !== undefined ? { color: input.color ?? null } : {}),
      })
      .where(
        and(
          eq(calendarNote.id, c.req.param("id")),
          eq(calendarNote.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!row) return c.json({ message: "Catatan tidak ditemukan" }, 404);
    return c.json({ note: row });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /calendar/notes/:id — hapus note */
calendarRoute.delete("/notes/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await db
      .delete(calendarNote)
      .where(
        and(
          eq(calendarNote.id, c.req.param("id")),
          eq(calendarNote.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
