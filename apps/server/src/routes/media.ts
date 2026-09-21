// API Media — upload/list/hapus file media ke Cloudflare R2
// + folder management, import dari URL, pindah folder

import { db } from "@sahabatkreator/db";
import { media, mediaFolder } from "@sahabatkreator/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import sharp from "sharp";
import { z } from "zod";
import { errorResponse, requireOrg } from "../lib/auth-guard";
import { checkFeatureGate } from "../lib/billing";
import { generateId } from "../lib/id";
import { deleteObject, isStorageConfigured, uploadObject } from "../lib/r2";
import { assertSafeExternalUrl, UnsafeUrlError } from "../lib/ssrf";

export const mediaRoute = new Hono();

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Spesifikasi dimensi resize per platform + post type (key "platform:postType").
 * Semua dalam piksel, mode cover (crop tengah).
 */
const RESIZE_SPECS: Record<string, { width: number; height: number }> = {
  "instagram:feed": { width: 1080, height: 1350 }, // rasio 4:5
  "instagram:story": { width: 1080, height: 1920 },
  "instagram:reel": { width: 1080, height: 1920 },
  instagram: { width: 1080, height: 1080 },
  tiktok: { width: 1080, height: 1920 },
  "youtube:thumbnail": { width: 1280, height: 720 },
  youtube: { width: 1280, height: 720 },
  twitter: { width: 1200, height: 675 },
  x: { width: 1200, height: 675 },
  linkedin: { width: 1200, height: 675 },
  default: { width: 1080, height: 1080 },
};
// Catatan keamanan: SVG sengaja TIDAK di-whitelist — raw SVG dapat berisi
// script/onclick (XSS). Konversi ke PNG/JPEG via resize bila perlu.
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
];

/**
 * Baca 4 byte ASCII mulai offset sebagai string tag (mis. "WEBP", "ftyp").
 * Byte di luar buffer dibaca 0 — pemanggil sudah menjamin panjang minimum.
 */
function asciiTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

/**
 * Deteksi content-type dari magic bytes (signature file).
 * Return MIME type hasil sniff, atau null bila tidak dikenali.
 * Mencegah content-type spoofing: file HTML/SVG berbahaya yang dikirim
 * sebagai image/png akan tertolak karena isi tidak cocok.
 */
function sniffContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";

  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }

  // RIFF container: WEBP (RIFF....WEBP) atau WAVE (RIFF....WAVE)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    const tag = asciiTag(bytes, 8);
    if (tag === "WEBP") return "image/webp";
    if (tag === "WAVE") return "audio/wav";
    return null;
  }

  // MP4/QuickTime/M4A: "ftyp" di offset 4
  if (asciiTag(bytes, 4) === "ftyp") {
    // brand setelah "ftyp" — "qt  " → QuickTime MOV, "M4A "/"M4B "/"M4P " →
    // audio M4A, selain itu (isom/mp42/dash/…) dianggap MP4 video
    const brand = asciiTag(bytes, 8);
    if (brand.startsWith("qt")) return "video/quicktime";
    if (/^M4[ABP] /.test(brand)) return "audio/mp4";
    return "video/mp4";
  }

  // WebM/MKV (EBML container): 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video/webm";
  }

  // PDF: 25 50 44 46 (%PDF)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }

  // MP3: "ID3" (tag) atau FF FB / FF F3 / FF F2 (frame sync MPEG audio)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio/mpeg";
  if (bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) {
    return "audio/mpeg";
  }

  return null;
}

/**
 * Cocokkan hasil sniff magic bytes dengan content-type yang diklaim client.
 * Return true bila isi file mendukung klaim content-type.
 * Aturan longgar antar codec serumpun (video/mp4 ↔ video/quicktime) karena
 * beberapa container saling kompatibel — selama keduanya di whitelist.
 */
function sniffMatches(claimed: string, sniffed: string | null): boolean {
  if (!sniffed) return false;
  if (claimed === sniffed) return true;
  // Container MP4/MOV sering tertukar antar encoder — izinkan keduanya
  if (
    (claimed === "video/mp4" && sniffed === "video/quicktime") ||
    (claimed === "video/quicktime" && sniffed === "video/mp4")
  )
    return true;
  return false;
}

/**
 * Batas dimensi & ukuran hasil normalisasi gambar.
 * 4096px: platform sosmed max 1080–4096px — lebih dari itu hanya buang storage.
 * 20 MB: batas per foto TikTok (paling ketat di antara platform yang didukung).
 */
const IMAGE_MAX_DIMENSION = 4096;
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Normalisasi gambar agar kompatibel semua platform + hemat storage:
 * - PNG → JPEG (flatten alpha ke putih; TikTok photo post hanya dukung JPEG/WebP)
 * - Downscale bila sisi terpanjang > 4096px
 * - Re-encode bila hasil masih > 20 MB
 * GIF, video, dan audio tidak disentuh. Return null bila tidak perlu dikonversi.
 */
async function normalizeImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer<ArrayBuffer>; mimeType: string } | null> {
  if (mimeType === "image/gif" || !mimeType.startsWith("image/")) return null;

  const image = sharp(buffer, { limitInputPixels: 268402689 }); // guard dekod — cegah decompression bomb
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const needsDownscale = Math.max(width, height) > IMAGE_MAX_DIMENSION;
  const needsPngConvert = mimeType === "image/png";

  if (!needsDownscale && !needsPngConvert && buffer.byteLength <= IMAGE_MAX_BYTES) return null;

  let pipeline = image.rotate(); // hormati orientasi EXIF
  if (needsDownscale) {
    pipeline = pipeline.resize({
      width: IMAGE_MAX_DIMENSION,
      height: IMAGE_MAX_DIMENSION,
      fit: "inside", // jangan upscale / jangan distorsi — hanya perkecil
      withoutEnlargement: true,
    });
  }
  // JPEG: universally diterima semua platform (TikTok/IG/FB/Pinterest/…)
  const converted = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();

  // Kasus ekstrem (downscale + quality 90 masih > 20MB): turunkan quality satu tahap
  if (converted.byteLength > IMAGE_MAX_BYTES) {
    const smaller = await pipeline.jpeg({ quality: 75, mozjpeg: true }).toBuffer();
    return smaller.byteLength < converted.byteLength
      ? { buffer: smaller, mimeType: "image/jpeg" }
      : { buffer: converted, mimeType: "image/jpeg" };
  }
  return { buffer: converted, mimeType: "image/jpeg" };
}

/** GET /media — list media org (filter: folderId) */
mediaRoute.get("/", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const folderId = c.req.query("folderId");

    const conditions = [eq(media.organizationId, ctx.organization.id)];
    if (folderId) conditions.push(eq(media.folderId, folderId));

    const items = await db
      .select()
      .from(media)
      .where(and(...conditions))
      .orderBy(desc(media.createdAt))
      .limit(200);
    return c.json({ items, storageConfigured: isStorageConfigured() });
  } catch (error) {
    return errorResponse(error);
  }
});

// ---------------------------------------------------------------------------
// Folder media
// ---------------------------------------------------------------------------

/** GET /media/folders — list folder org */
mediaRoute.get("/folders", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const folders = await db
      .select()
      .from(mediaFolder)
      .where(eq(mediaFolder.organizationId, ctx.organization.id))
      .orderBy(mediaFolder.name);
    return c.json({ folders });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /media/folders — buat folder baru */
mediaRoute.post("/folders", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ name: z.string().min(1).max(80) }).parse(await c.req.json());

    const id = generateId("mfolder");
    await db.insert(mediaFolder).values({
      id,
      organizationId: ctx.organization.id,
      name: input.name,
    });
    const [row] = await db.select().from(mediaFolder).where(eq(mediaFolder.id, id));
    return c.json({ folder: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /media/folders/:id — rename folder */
mediaRoute.patch("/folders/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ name: z.string().min(1).max(80) }).parse(await c.req.json());

    await db
      .update(mediaFolder)
      .set({ name: input.name })
      .where(
        and(
          eq(mediaFolder.id, c.req.param("id")),
          eq(mediaFolder.organizationId, ctx.organization.id),
        ),
      );
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /media/folders/:id — hapus folder (media di dalamnya dipindah ke root) */
mediaRoute.delete("/folders/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const folderId = c.req.param("id");

    const [folder] = await db
      .select()
      .from(mediaFolder)
      .where(and(eq(mediaFolder.id, folderId), eq(mediaFolder.organizationId, ctx.organization.id)))
      .limit(1);
    if (!folder) return c.json({ message: "Folder tidak ditemukan" }, 404);

    // Media di dalam folder dipindah ke root (folderId null), tidak dihapus
    await db
      .update(media)
      .set({ folderId: null })
      .where(and(eq(media.organizationId, ctx.organization.id), eq(media.folderId, folderId)));
    await db.delete(mediaFolder).where(eq(mediaFolder.id, folderId));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /media/move — pindah media ke folder */
mediaRoute.post("/move", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        ids: z.array(z.string()).min(1),
        folderId: z.string().nullable(),
      })
      .parse(await c.req.json());

    // Validasi folder milik org (bila bukan root)
    if (input.folderId) {
      const [folder] = await db
        .select({ id: mediaFolder.id })
        .from(mediaFolder)
        .where(
          and(
            eq(mediaFolder.id, input.folderId),
            eq(mediaFolder.organizationId, ctx.organization.id),
          ),
        )
        .limit(1);
      if (!folder) return c.json({ message: "Folder tidak valid" }, 400);
    }

    await db
      .update(media)
      .set({ folderId: input.folderId })
      .where(and(eq(media.organizationId, ctx.organization.id), inArray(media.id, input.ids)));
    return c.json({ ok: true, moved: input.ids.length });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /media/import — import media dari URL eksternal (download → R2) */
mediaRoute.post("/import", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "media_storage");

    if (!isStorageConfigured()) {
      return c.json({ message: "Storage R2 belum dikonfigurasi" }, 503);
    }

    const input = z
      .object({
        url: z.string().url().max(2048),
        name: z.string().max(200).optional(),
        folderId: z.string().nullable().optional(),
      })
      .parse(await c.req.json());

    // SSRF guard: hanya http(s) + tolak DNS yang resolve ke IP internal
    // (private/loopback/link-local/ULA, termasuk IPv4-mapped IPv6).
    try {
      await assertSafeExternalUrl(input.url);
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        return c.json({ message: error.message }, 400);
      }
      throw error;
    }

    // redirect: "error" — redirect bisa dipakai melewati validasi awal
    // (mis. URL publik → 302 ke 169.254.169.254). R2 public URL tidak redirect.
    const res = await fetch(input.url, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
      headers: { "User-Agent": "SahabatKreator-Import/1.0" },
    });
    if (!res.ok) {
      return c.json({ message: `Gagal mengunduh file (${res.status})` }, 400);
    }
    const contentType = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!ALLOWED_TYPES.includes(contentType)) {
      return c.json(
        { message: `Tipe file tidak didukung: ${contentType || "tidak dikenal"}` },
        400,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_FILE_SIZE) {
      return c.json({ message: "Ukuran file maksimal 100 MB" }, 400);
    }

    // Validasi isi file (magic bytes) vs content-type klaim server sumber
    const sniffed = sniffContentType(new Uint8Array(buffer));
    if (!sniffMatches(contentType, sniffed)) {
      return c.json({ message: "Tipe file tidak sesuai isi" }, 400);
    }

    // Normalisasi gambar (PNG→JPEG, cap 4096px/20MB) — kompatibel semua platform
    let finalBuffer = buffer;
    let finalMimeType = contentType;
    const normalized = await normalizeImage(buffer, contentType);
    if (normalized) {
      finalBuffer = normalized.buffer;
      finalMimeType = normalized.mimeType;
    }

    // Ambil nama file dari path URL (assertSafeExternalUrl sudah memastikan URL valid)
    const parsed = new URL(input.url);
    let filename = input.name ?? parsed.pathname.split("/").pop() ?? "imported";
    if (normalized && !filename.toLowerCase().match(/\.(jpe?g)$/)) {
      filename = `${filename.replace(/\.[^.]+$/, "")}.jpg`;
    }
    const { storageKey, url } = await uploadObject(ctx.organization.id, {
      data: finalBuffer,
      mimeType: finalMimeType,
      originalName: filename,
    });

    const id = generateId("media");
    await db.insert(media).values({
      id,
      organizationId: ctx.organization.id,
      name: filename,
      type: finalMimeType.startsWith("video/")
        ? "video"
        : finalMimeType.startsWith("audio/")
          ? "audio"
          : "image",
      storageKey,
      url,
      mimeType: finalMimeType,
      sizeBytes: finalBuffer.byteLength,
      folderId: input.folderId ?? null,
      uploadedByUserId: ctx.user.id,
    });

    const [row] = await db.select().from(media).where(eq(media.id, id));
    return c.json({ media: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /media/upload — upload file (multipart/form-data: file, altText?, thumbnail?)
 * thumbnail = JPEG frame video di-generate client-side (canvas) untuk video. */
mediaRoute.post("/upload", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "media_storage");

    if (!isStorageConfigured()) {
      return c.json({ message: "Storage R2 belum dikonfigurasi oleh administrator" }, 503);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return c.json({ message: "Field 'file' wajib berupa file" }, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ message: "Ukuran file maksimal 100 MB" }, 400);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ message: `Tipe file tidak didukung: ${file.type}` }, 400);
    }

    const altText = formData.get("altText");
    let buffer = Buffer.from(await file.arrayBuffer());

    // Validasi isi file (magic bytes) vs content-type yang diklaim client —
    // cegah upload file berbahaya (HTML/SVG) menyamar sebagai gambar.
    const sniffed = sniffContentType(new Uint8Array(buffer));
    if (!sniffMatches(file.type, sniffed)) {
      return c.json({ message: "Tipe file tidak sesuai isi" }, 400);
    }

    // Normalisasi gambar (PNG→JPEG, cap 4096px/20MB) — kompatibel semua platform
    // + hemat storage. Video/audio/GIF tidak disentuh (re-encode video = ffmpeg, berat).
    let mimeType = file.type;
    let filename = file.name;
    const normalized = await normalizeImage(buffer, mimeType);
    if (normalized) {
      buffer = normalized.buffer;
      mimeType = normalized.mimeType;
      if (!filename.toLowerCase().endsWith(".jpg") && !filename.toLowerCase().endsWith(".jpeg")) {
        filename = `${filename.replace(/\.[^.]+$/, "")}.jpg`;
      }
    }

    // Thumbnail video (opsional): JPEG frame dari browser — validasi magic
    // bytes agar tidak bisa dipakai menyelundupkan file lain ke R2.
    let thumbnailUrl: string | null = null;
    const thumbnail = formData.get("thumbnail");
    if (thumbnail instanceof File && thumbnail.size > 0 && file.type.startsWith("video/")) {
      const thumbBuffer = Buffer.from(await thumbnail.arrayBuffer());
      if (sniffContentType(new Uint8Array(thumbBuffer)) === "image/jpeg") {
        const { url } = await uploadObject(ctx.organization.id, {
          data: thumbBuffer,
          mimeType: "image/jpeg",
          originalName: `${file.name}.jpg`,
        });
        thumbnailUrl = url;
      }
    }

    const { storageKey, url } = await uploadObject(ctx.organization.id, {
      data: buffer,
      mimeType,
      originalName: filename,
    });

    const id = generateId("media");
    await db.insert(media).values({
      id,
      organizationId: ctx.organization.id,
      name: filename,
      type: mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : "image",
      storageKey,
      url,
      thumbnailUrl,
      mimeType,
      sizeBytes: buffer.byteLength,
      altText: typeof altText === "string" ? altText : null,
      uploadedByUserId: ctx.user.id,
    });

    const [row] = await db.select().from(media).where(eq(media.id, id));
    return c.json({ media: row }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /media/resize — auto-resize gambar ke dimensi platform via sharp */
mediaRoute.post("/resize", async (c) => {
  try {
    const ctx = await requireOrg(c);
    await checkFeatureGate(ctx.organization.id, "media_storage");

    if (!isStorageConfigured()) {
      return c.json({ message: "Storage R2 belum dikonfigurasi oleh administrator" }, 503);
    }

    const input = z
      .object({
        mediaId: z.string().min(1),
        platform: z.string().min(1).max(40),
        postType: z.enum(["feed", "story", "reel"]).optional(),
      })
      .parse(await c.req.json());

    // Ambil media milik org
    const [source] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, input.mediaId), eq(media.organizationId, ctx.organization.id)))
      .limit(1);
    if (!source) return c.json({ message: "Media tidak ditemukan" }, 404);
    if (source.type !== "image") {
      return c.json({ message: "Hanya media bertipe gambar yang bisa di-resize" }, 400);
    }

    // Dimensi target per platform + post type
    const key = input.postType ? `${input.platform}:${input.postType}` : input.platform;
    const target = RESIZE_SPECS[key] ?? RESIZE_SPECS[input.platform] ?? RESIZE_SPECS.default;
    if (!target) {
      return c.json({ message: `Kombinasi platform/postType tidak dikenal: ${key}` }, 400);
    }

    // Unduh file dari R2 (via URL publik atau storage key internal)
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return c.json({ message: `Gagal mengunduh media sumber (${res.status})` }, 400);
    }
    const sourceBuffer = Buffer.from(await res.arrayBuffer());

    // Resize: cover (crop tengah) tanpa upscale bila sumber lebih kecil
    const resized = await sharp(sourceBuffer)
      .rotate() // hormati metadata orientasi EXIF
      .resize({
        width: target.width,
        height: target.height,
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    // Upload sebagai media baru
    const nameSuffix = `-resized-${key.replace(":", "-")}`;
    const baseName = source.name.replace(/\.[^.]+$/, "");
    const newName = `${baseName}${nameSuffix}.jpg`;

    const { storageKey, url } = await uploadObject(ctx.organization.id, {
      data: resized.data,
      mimeType: "image/jpeg",
      originalName: newName,
    });

    const id = generateId("media");
    await db.insert(media).values({
      id,
      organizationId: ctx.organization.id,
      name: newName,
      type: "image",
      storageKey,
      url,
      mimeType: "image/jpeg",
      sizeBytes: resized.data.byteLength,
      width: resized.info.width,
      height: resized.info.height,
      altText: source.altText,
      folderId: source.folderId,
      uploadedByUserId: ctx.user.id,
    });

    const [row] = await db.select().from(media).where(eq(media.id, id));
    return c.json({ media: row, target: { width: target.width, height: target.height } }, 201);
  } catch (error) {
    return errorResponse(error);
  }
});

/** PATCH /media/:id — update metadata (altText, name) */
mediaRoute.patch("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z
      .object({
        name: z.string().min(1).optional(),
        altText: z.string().nullable().optional(),
      })
      .parse(await c.req.json());

    await db
      .update(media)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
      })
      .where(and(eq(media.id, c.req.param("id")), eq(media.organizationId, ctx.organization.id)));
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** DELETE /media/:id — hapus media + object R2 */
/** StorageKey R2 dari public URL media — null bila URL bukan format storage
 * (mis. R2_PUBLIC_URL berubah sejak upload). Key = path setelah folder org. */
function storageKeyFromUrl(url: string | null, organizationId: string): string | null {
  if (!url) return null;
  const idx = url.indexOf(`/${organizationId}/`);
  return idx >= 0 ? url.slice(idx + 1) : null;
}

/** Hapus object thumbnail R2 milik media (best-effort, log-only) */
async function deleteThumbnailObject(url: string | null, organizationId: string): Promise<void> {
  const key = storageKeyFromUrl(url, organizationId);
  if (!key) return;
  await deleteObject(key).catch((err: unknown) =>
    console.error("[media] gagal hapus thumbnail R2:", err),
  );
}

mediaRoute.delete("/:id", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const [row] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, c.req.param("id")), eq(media.organizationId, ctx.organization.id)))
      .limit(1);
    if (!row) return c.json({ message: "Media tidak ditemukan" }, 404);

    await db.delete(media).where(eq(media.id, row.id));
    if (isStorageConfigured()) {
      await deleteObject(row.storageKey).catch((err: unknown) =>
        console.error("[media] gagal hapus object R2:", err),
      );
      await deleteThumbnailObject(row.thumbnailUrl, row.organizationId);
    }
    return c.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

/** POST /media/batch-delete — hapus beberapa media sekaligus */
mediaRoute.post("/batch-delete", async (c) => {
  try {
    const ctx = await requireOrg(c);
    const input = z.object({ ids: z.array(z.string()).min(1) }).parse(await c.req.json());

    const rows = await db
      .select()
      .from(media)
      .where(and(eq(media.organizationId, ctx.organization.id), inArray(media.id, input.ids)));

    for (const row of rows) {
      await db.delete(media).where(eq(media.id, row.id));
      if (isStorageConfigured()) {
        await deleteObject(row.storageKey).catch(() => {});
        await deleteThumbnailObject(row.thumbnailUrl, row.organizationId);
      }
    }
    return c.json({ deleted: rows.length });
  } catch (error) {
    return errorResponse(error);
  }
});
