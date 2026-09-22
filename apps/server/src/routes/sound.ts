// API Sound Library — upload/list/hapus track audio (R2) untuk konten video
//
// Riset reference app: POST /api/audio/tracks — FormData (file, name, category),
// duration hardcoded 30 (bug). Normalisasi di sini:
// - Durasi + waveform dikirim client (hasil decode Web Audio API) — riil, bukan hardcode
// - Storage R2 (aturan workspace #6), bukan local disk
// - Delete membersihkan object R2 (reference tidak membersihkan file fisik)

import { db } from "@sahabatkreator/db";
import { audioTrack } from "@sahabatkreator/db/schema";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { generateId } from "../lib/id";
import { deleteObject, isStorageConfigured, uploadObject } from "../lib/r2";

export const soundRoute = new Hono();

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  // WAV: browser tidak konsisten — Chrome/Windows "audio/x-wav",
  // Firefox "audio/wave", IANA "audio/wav". Format yang sama.
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
];

/**
 * GET /sound — list track milik org + featured sistem.
 * Query: featured (true = hanya featured), q (cari nama).
 */
soundRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const featuredOnly = c.req.query("featured") === "true";
    const q = c.req.query("q");

    const conditions = [
      featuredOnly
        ? eq(audioTrack.isFeatured, true)
        : or(
            eq(audioTrack.organizationId, ctx.organization.id),
            isNull(audioTrack.organizationId),
          )!,
    ];

    const rows = await db
      .select()
      .from(audioTrack)
      .where(and(...conditions))
      .orderBy(desc(audioTrack.isFeatured), desc(audioTrack.createdAt))
      .limit(100);

    const items = q ? rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())) : rows;

    return c.json({ items, storageConfigured: isStorageConfigured() });
  } catch (error) {
    return errorResponse(error);
  }
});

/**
 * POST /sound/upload — upload track baru.
 * FormData: file, name?, category?, durationSeconds?, waveform? (JSON array amplitudo).
 * Durasi/waveform diisi client hasil decode Web Audio API (riil, bukan hardcode).
 */
soundRoute.post("/upload", async (c) => {
  try {
    const ctx = await requireOrg(c);
    if (!isStorageConfigured()) {
      return c.json({ message: "Storage R2 belum dikonfigurasi oleh administrator" }, 503);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ message: "Field 'file' wajib berupa file" }, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ message: "Ukuran file maksimal 20 MB" }, 400);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ message: `Tipe file tidak didukung: ${file.type}` }, 400);
    }

    const name = String(formData.get("name") ?? file.name).slice(0, 200);
    const category = formData.get("category");
    const durationRaw = Number(formData.get("durationSeconds") ?? 0);
    const waveformRaw = formData.get("waveform");

    // Durasi harus diisi client (decode Web Audio) — tolak bila 0/negatif
    const durationSeconds = Math.round(durationRaw);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600) {
      return c.json(
        { message: "Durasi audio tidak valid (maksimal 10 menit) — coba upload ulang" },
        400,
      );
    }

    let waveform: number[] | null = null;
    if (typeof waveformRaw === "string" && waveformRaw.length > 0) {
      try {
        const parsed = JSON.parse(waveformRaw);
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
          waveform = parsed.slice(0, 200).map((v) => Math.min(1, Math.max(0, v)));
        }
      } catch {
        // waveform invalid → simpan null saja (non-fatal)
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { storageKey, url } = await uploadObject(ctx.organization.id, {
      data: buffer,
      mimeType: file.type,
      originalName: file.name,
    });

    const id = generateId("audio");
    const [track] = await db
      .insert(audioTrack)
      .values({
        id,
        organizationId: ctx.organization.id,
        name,
        url,
        storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        durationSeconds,
        waveformData: waveform,
        isFeatured: false,
        category: typeof category === "string" && category ? category.slice(0, 50) : null,
        uploadedByUserId: ctx.user.id,
      })
      .returning();
    return c.json({ track }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /sound/:id — rename / ubah kategori (hanya track milik org, bukan featured) */
soundRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        name: z.string().min(1).max(200).optional(),
        category: z.string().max(50).nullable().optional(),
      })
      .parse(await c.req.json());

    const [track] = await db
      .update(audioTrack)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
      })
      .where(
        and(
          eq(audioTrack.id, c.req.param("id")),
          eq(audioTrack.organizationId, ctx.organization.id),
        ),
      )
      .returning();
    if (!track) return c.json({ message: "Track tidak ditemukan" }, 404);
    return c.json({ track });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /sound/:id — hapus track + object R2 (hanya milik org) */
soundRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [track] = await db
      .delete(audioTrack)
      .where(
        and(
          eq(audioTrack.id, c.req.param("id")),
          eq(audioTrack.organizationId, ctx.organization.id),
        ),
      )
      .returning();

    if (!track) return c.json({ message: "Track tidak ditemukan" }, 404);
    if (track.storageKey) {
      await deleteObject(track.storageKey).catch(() => undefined); // best-effort
    }
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});
