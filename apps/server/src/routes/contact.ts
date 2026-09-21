// API Contact — form kontak publik (marketing) + inbox admin

import { db } from "@sahabatkreator/db";
import { contactSubmission } from "@sahabatkreator/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requirePlatformAdmin } from "../lib/auth-guard";
import { generateId } from "../lib/id";

export const contactRoute = new Hono();

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(200),
  message: z.string().min(10).max(5000),
});

// Rate-limit sederhana in-memory: max 3 submission / IP / 10 menit
// (cukup untuk anti-spam dasar; produksi skala besar pindah ke Redis)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  // Bersihkan entry basi agar map tidak tumbuh tanpa batas
  if (rateLimitMap.size > 10_000) {
    for (const [key, times] of rateLimitMap) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) rateLimitMap.delete(key);
    }
  }
  return hits.length > RATE_LIMIT_MAX;
}

/** POST /contact — kirim pesan dari form kontak (publik, tanpa auth) */
contactRoute.post("/", async (c) => {
  try {
    const input = contactSchema.parse(await c.req.json());

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    if (isRateLimited(ip)) {
      return c.json({ message: "Terlalu banyak pengiriman. Coba lagi dalam beberapa menit." }, 429);
    }

    await db.insert(contactSubmission).values({
      id: generateId("contact"),
      name: input.name,
      email: input.email,
      message: input.message,
      ipAddress: ip,
    });

    return c.json({ ok: true }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** GET /contact — inbox submission untuk admin (paginasi + filter status) */
contactRoute.get("/", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const page = Math.max(Number(c.req.query("page") ?? 1), 1);
    const perPage = Math.min(Number(c.req.query("perPage") ?? 20), 100);
    const status = c.req.query("status"); // "open" | "resolved" | undefined (semua)

    const conditions = status ? [eq(contactSubmission.status, status)] : [];

    const submissions = await db
      .select()
      .from(contactSubmission)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(contactSubmission.createdAt))
      .limit(perPage)
      .offset((page - 1) * perPage);

    const [total] = await db
      .select({ total: count() })
      .from(contactSubmission)
      .where(conditions.length ? and(...conditions) : undefined);

    // Hitung open untuk badge
    const [openCount] = await db
      .select({ total: count() })
      .from(contactSubmission)
      .where(eq(contactSubmission.status, "open"));

    return c.json({
      submissions,
      total: total?.total ?? 0,
      openCount: openCount?.total ?? 0,
      page,
      perPage,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /contact/:id — tandai resolved / buka kembali */
contactRoute.patch("/:id", async (c) => {
  try {
    await requirePlatformAdmin(c);
    const input = z.object({ status: z.enum(["open", "resolved"]) }).parse(await c.req.json());

    const id = c.req.param("id");
    const [updated] = await db
      .update(contactSubmission)
      .set({
        status: input.status,
        resolvedAt: input.status === "resolved" ? new Date() : null,
      })
      .where(eq(contactSubmission.id, id))
      .returning({ id: contactSubmission.id });
    if (!updated) return c.json({ message: "Submission tidak ditemukan" }, 404);

    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
