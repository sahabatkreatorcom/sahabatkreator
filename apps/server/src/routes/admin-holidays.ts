// API Admin — statistik platform, user & org management, plans, credentials, settings

import { db } from "@sahabatkreator/db";
import { holiday } from "@sahabatkreator/db/schema";
import { and, asc, count, eq, ilike } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { logAdminAction } from "../lib/audit";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { parseCsv } from "../lib/csv-import";
import { generateId } from "../lib/id";

export const adminHolidaysRoute = new Hono();
/** GET /admin/holidays — list semua hari besar (termasuk non-aktif), paginasi + filter */
adminHolidaysRoute.get("/holidays", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 50), 200);
    const search = c.req.query("search")?.trim() ?? "";
    const month = Number(c.req.query("month"));

    const conditions = [];
    if (search) conditions.push(ilike(holiday.name, `%${search}%`));
    if (month >= 1 && month <= 12) conditions.push(eq(holiday.month, month));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(holiday)
      .where(where)
      .orderBy(asc(holiday.month), asc(holiday.day))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db.select({ total: count() }).from(holiday).where(where);

    return c.json({ holidays: rows, total: total?.total ?? 0, page, perPage });
  } catch (error) {
    return errorResponse(error);
  }
});

const holidayInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  scope: z.enum(["national", "international"]),
  category: z.string().max(50).optional(),
  ideaTemplates: z
    .array(z.object({ angle: z.string().max(200), example: z.string().max(500) }))
    .max(10)
    .optional()
    .nullable(),
  suggestedHashtags: z.array(z.string().max(100)).max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});

/** POST /admin/holidays — buat hari besar baru */
adminHolidaysRoute.post("/holidays", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = holidayInputSchema.parse(await c.req.json());

    const id = generateId("holiday");
    await db.insert(holiday).values({ id, ...input, category: input.category ?? "umum" });

    logAdminAction(c, ctx.user.id, {
      action: "holiday.create",
      entityType: "holiday",
      entityId: id,
      metadata: { name: input.name, month: input.month, day: input.day },
    });

    return c.json({ id }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /admin/holidays/:id — update hari besar */
adminHolidaysRoute.patch("/holidays/:id", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const input = holidayInputSchema.partial().parse(await c.req.json());
    const id = c.req.param("id");

    const updated = await db
      .update(holiday)
      .set({ ...input })
      .where(eq(holiday.id, id))
      .returning({ id: holiday.id });

    if (updated.length === 0) {
      return c.json({ message: "Hari besar tidak ditemukan" }, 404);
    }

    logAdminAction(c, ctx.user.id, {
      action: "holiday.update",
      entityType: "holiday",
      entityId: id,
      metadata: { ...input },
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /admin/holidays/:id — hapus hari besar */
adminHolidaysRoute.delete("/holidays/:id", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const id = c.req.param("id");

    const deleted = await db
      .delete(holiday)
      .where(eq(holiday.id, id))
      .returning({ id: holiday.id });

    if (deleted.length === 0) {
      return c.json({ message: "Hari besar tidak ditemukan" }, 404);
    }

    logAdminAction(c, ctx.user.id, {
      action: "holiday.delete",
      entityType: "holiday",
      entityId: id,
      metadata: {},
    });

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

const holidayImportRowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  scope: z.enum(["national", "international"]),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

/** Parse sel "a | b" atau "a; b" → array ter-trim (untuk hashtags CSV) */
function splitList(cell: string): string[] {
  return cell
    .split(/[;|]/)
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean);
}

/** Parse sel ide konten "angle: example" per baris (multiline) → ideaTemplates */
function parseIdeaTemplates(cell: string): { angle: string; example: string }[] {
  return cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf(":");
      if (sep > 0) {
        return { angle: line.slice(0, sep).trim(), example: line.slice(sep + 1).trim() };
      }
      return { angle: line, example: "" };
    })
    .slice(0, 10);
}

/**
 * POST /admin/holidays/import — import massal CSV.
 * Body: multipart form (file) atau JSON { csv: string }.
 * Kolom wajib: name, month, day, scope. Opsional: description, category,
 * suggested_hashtags (pisah ; atau |), idea_templates (multiline "angle: example"),
 * is_active (true/false). Upsert by (month, day, name) — baris duplikat di-update.
 *
 * File .xlsx dikonversi ke CSV di sisi admin UI (SheetJS) sebelum dikirim.
 */
adminHolidaysRoute.post("/holidays/import", async (c) => {
  try {
    const ctx = await requirePlatformAdmin(c);
    const contentType = c.req.header("content-type") ?? "";

    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return c.json({ message: "File CSV wajib diupload" }, 400);
      }
      csvText = await file.text();
    } else {
      const body = (await c.req.json()) as { csv?: string };
      csvText = body.csv ?? "";
    }

    const rows = parseCsv(csvText);
    if (rows.length < 2) {
      return c.json({ message: "CSV kosong — butuh header + minimal 1 baris data" }, 400);
    }

    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    if (col("name") < 0 || col("month") < 0 || col("day") < 0 || col("scope") < 0) {
      return c.json(
        { message: "Kolom wajib: name, month, day, scope (national|international)" },
        400,
      );
    }

    const results: { row: number; status: "ok" | "error"; message?: string }[] = [];
    let imported = 0;

    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells) continue;
      const get = (name: string): string => {
        const idx = col(name);
        return idx >= 0 ? (cells[idx] ?? "").trim() : "";
      };

      const parsed = holidayImportRowSchema.safeParse({
        name: get("name"),
        description: get("description") || null,
        month: Number(get("month")),
        day: Number(get("day")),
        scope: get("scope").toLowerCase(),
        category: get("category") || undefined,
        isActive: get("is_active") ? get("is_active").toLowerCase() === "true" : undefined,
      });

      if (!parsed.success) {
        results.push({
          row: i,
          status: "error",
          message: parsed.error.issues.map((iss) => iss.message).join(", "),
        });
        continue;
      }

      // Validasi kombinasi bulan/tanggal (mis. 31 Feb tidak valid)
      const probe = new Date(2024, parsed.data.month - 1, parsed.data.day);
      if (probe.getMonth() !== parsed.data.month - 1 || probe.getDate() !== parsed.data.day) {
        results.push({ row: i, status: "error", message: "kombinasi bulan/tanggal tidak valid" });
        continue;
      }

      const hashtagsCell = get("suggested_hashtags");
      const ideasCell = get("idea_templates");

      const values = {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        month: parsed.data.month,
        day: parsed.data.day,
        scope: parsed.data.scope,
        category: parsed.data.category ?? "umum",
        ...(hashtagsCell ? { suggestedHashtags: splitList(hashtagsCell) } : {}),
        ...(ideasCell ? { ideaTemplates: parseIdeaTemplates(ideasCell) } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      };

      // Upsert by unique index (month, day, name) — duplikat di-update
      await db
        .insert(holiday)
        .values({ id: generateId("holiday"), ...values })
        .onConflictDoUpdate({
          target: [holiday.month, holiday.day, holiday.name],
          set: values,
        });
      imported++;

      results.push({ row: i, status: "ok" });
    }

    logAdminAction(c, ctx.user.id, {
      action: "holiday.import",
      entityType: "holiday",
      entityId: "bulk",
      metadata: { rows: rows.length - 1, imported },
    });

    return c.json({
      totalRows: rows.length - 1,
      okRows: results.filter((r) => r.status === "ok").length,
      errorRows: results.filter((r) => r.status === "error").length,
      imported,
      rows: results,
    });
  } catch (error) {
    return errorResponse(error);
  }
});
