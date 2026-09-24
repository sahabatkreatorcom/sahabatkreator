// AI Visual Layout Director (RFC §7) — vision model menentukan placement teks
// di slide: deteksi wajah/objek penting background, pilih zona aman (negative
// space), alignment, dan kontras teks.
//
// Tiga perbaikan vs repo referensi (yang call per-slide):
// 1. Batch semua background dalam 1 call multimodal → 6 slide = 1 call.
// 2. Cache layout per contentHash background (+ style+format+model) di Redis.
// 3. Fallback ke template fixed (zone "center") bila vision gagal — render
//    tidak pernah diblokir oleh AI.
//
// Dipanggil carousel-processor SETELAH background resolve (mode stock/library),
// SEBELUM panggil Modal. Hasil disimpan di carousel_job_slide.layout (jsonb).

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@sahabatkreator/db";
import { media } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import {
  chatCompletionMultimodal,
  consumeAiCredits,
  getAiConfig,
} from "@sahabatkreator/publishing";
import type { ConnectionOptions } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { getRedisConnection } from "./connection";

/** Zona penempatan teks — vertikal */
export type LayoutZone = "top" | "center" | "bottom";

/** Alignment horizontal teks dalam zona */
export type LayoutAlign = "left" | "center" | "right";

/** Kontras teks — dipilih vision model berdasarkan kecerahan background */
export type LayoutContrast = "light" | "dark";

/** Layout satu slide — kontrak yang renderer Modal terima */
export type SlideLayout = {
  urutan: number;
  zone: LayoutZone;
  align: LayoutAlign;
  contrast: LayoutContrast;
};

/** Maksimum background per call multimodal — batas praktis token & payload */
const MAX_IMAGES_PER_CALL = 10;

/** TTL cache layout — background sama + setting sama = layout sama */
const LAYOUT_CACHE_TTL_S = 30 * 24 * 3600; // 30 hari

/**
 * Biaya kredit untuk 1 call layout director (batch seluruh carousel).
 * Sinkron dengan AI_CREDIT_COST di publishing/ai.ts — nilai 2 (sama aksi carousel).
 */
const LAYOUT_CREDIT_COST = 2;

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET
    ) {
      throw new Error("R2 belum dikonfigurasi — layout director butuh akses background");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

/** Download background dari R2, encode base64 JPEG (siap dikirim ke vision model) */
async function fetchAsBase64(storageKey: string): Promise<string | null> {
  try {
    const res = await getS3().send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: storageKey }),
    );
    // Stream body → buffer (transformToByteArray tidak ada di versi SDK ini)
    const stream = res.Body;
    if (!stream) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch (error) {
    console.error(`[layout-director] gagal fetch ${storageKey}:`, error);
    return null;
  }
}

/**
 * Hitung layout untuk semua slide dalam SATU call vision (RFC §7 batch).
 *
 * Return null (bukan throw) bila AI tidak terkonfigurasi / gagal / kredit
 * habis — caller wajib fallback ke template center. Itu kontraknya: vision
 * adalah optimisasi, bukan dependensi. Render tidak pernah diblokir oleh AI.
 *
 * @param opts.slides urutan + storageKey background (sudah resolve ke R2)
 * @param opts.style  style tipografi (konteks model)
 * @param opts.format rasio output
 * @param opts.organizationId org pemilik job (untuk quota kredit AI)
 */
export async function computeSlideLayouts(opts: {
  slides: { urutan: number; storageKey: string }[];
  style: string;
  format: string;
  organizationId: string;
}): Promise<SlideLayout[] | null> {
  const { slides } = opts;
  if (!slides.length) return null;

  // Ambil konfigurasi AI (key dari platformSettings → fallback env).
  // Bila AI belum dikonfigurasi sama sekali → null, fallback template.
  const config = await getAiConfig();
  if (!config) return null;
  const model = config.model;

  // 0. Cek quota kredit seboum call — habis = fallback (bukan error fatal).
  // Layout = 1 call multimodal untuk seluruh carousel → 2 kredit (sama carousel).
  try {
    await consumeAiCredits(opts.organizationId, Number.MAX_SAFE_INTEGER, {
      action: "carousel_layout",
      model,
      credits: LAYOUT_CREDIT_COST,
    });
  } catch {
    console.warn("[layout-director] kredit AI habis — fallback template center");
    return null;
  }

  // 1. Cek cache Redis — key: contentHash background + setting + model
  const cacheKey = layoutCacheKey(slides, opts.style, opts.format, model);
  const cached = await readLayoutCache(cacheKey);
  if (cached) {
    console.log(`[layout-director] cache hit (${cached.length} slide)`);
    return cached;
  }

  // 2. Batch fetch background (potong ke MAX_IMAGES_PER_CALL — carousel ≤10)
  const batch = slides.slice(0, MAX_IMAGES_PER_CALL);
  const images = await Promise.all(
    batch.map(async (s) => ({
      urutan: s.urutan,
      dataUrl: await fetchAsBase64(s.storageKey),
    })),
  );
  const valid = images.filter((i): i is { urutan: number; dataUrl: string } => !!i.dataUrl);
  if (!valid.length) return null;

  // 3. Satu call multimodal: semua image + instruksi placement
  const system = [
    "Kamu adalah AI Visual Layout Director untuk carousel social media.",
    "Tugas: untuk tiap gambar, tentukan zona penempatan teks yang AMAN —",
    "hindari menutupi wajah orang, objek produk, atau area detail penting.",
    "Pilih zona dengan ruang kosong (negative space) terbesar.",
    "",
    "Kembalikan HANYA JSON valid (tanpa markdown fence):",
    '{"slides":[{"urutan":1,"zone":"top|center|bottom","align":"left|center|right","contrast":"light|dark"}]}',
    "",
    "Aturan:",
    '- zone: "top" = 20% atas, "center" = tengah, "bottom" = 20% bawah.',
    '- contrast: "light" = teks putih (background gelap), "dark" = teks hitam (background terang).',
    "- urutan HARUS cocok dengan urutan gambar yang dikirim.",
    `- Jumlah slide di array HARUS tepat ${valid.length}.`,
  ].join("\n");

  const content: unknown[] = [
    { type: "text", text: `Tentukan layout untuk ${valid.length} slide carousel ini.` },
    ...valid.map((i) => ({
      type: "image_url",
      image_url: { url: i.dataUrl, detail: "low" },
    })),
  ];

  try {
    const raw = await chatCompletionMultimodal(config, system, content, {
      temperature: 0.3, // deterministik — layout stabil per background
      maxTokens: 1200,
    });
    const parsed = parseLayoutResponse(
      raw,
      valid.map((v) => v.urutan),
    );
    if (!parsed) return null;

    // 4. Tulis cache — background sama + setting sama tidak call ulang
    await writeLayoutCache(cacheKey, parsed);
    console.log(`[layout-director] layout computed for ${parsed.length} slide (1 call)`);
    return parsed;
  } catch (error) {
    // Vision gagal (timeout / rate limit / halusinasi) → fallback template.
    // Render tidak boleh diblokir oleh AI. RFC §7: fallback WAJIB.
    console.error("[layout-director] vision call gagal, pakai template center:", error);
    return null;
  }
}

/** Key cache: hash semua background + setting — cache per kombination */
function layoutCacheKey(
  slides: { urutan: number; storageKey: string }[],
  style: string,
  format: string,
  model: string,
): string {
  const parts = slides.map((s) => s.storageKey).join("|");
  const hash = Buffer.from(`${parts}::${style}::${format}::${model}`).toString("base64");
  return `sk:carousel-layout:${hash}`;
}

/** Bikin klien ioredis dari ConnectionOptions BullMQ (ambill url-nya) */
function redisClientFromConn(conn: ConnectionOptions): import("ioredis").Redis {
  const { default: IORedis } = require("ioredis") as typeof import("ioredis");
  const url = (conn as { url?: string }).url ?? (typeof conn === "string" ? conn : "");
  return new IORedis(url);
}

async function readLayoutCache(key: string): Promise<SlideLayout[] | null> {
  const conn = getRedisConnection();
  if (!conn) return null;
  try {
    const client = redisClientFromConn(conn);
    try {
      const raw = await client.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SlideLayout[];
      return Array.isArray(parsed) ? parsed : null;
    } finally {
      await client.quit().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

async function writeLayoutCache(key: string, layouts: SlideLayout[]): Promise<void> {
  const conn = getRedisConnection();
  if (!conn) return;
  try {
    const client = redisClientFromConn(conn);
    try {
      await client.set(key, JSON.stringify(layouts), "EX", LAYOUT_CACHE_TTL_S);
    } finally {
      await client.quit().catch(() => undefined);
    }
  } catch {
    // cache gagal tulis bukan fatal — next job akan call vision lagi
  }
}

/** Parse JSON layout dari response — tahan markdown fence + validasi zona */
function parseLayoutResponse(raw: string, urutans: number[]): SlideLayout[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  const obj = parsed as { slides?: unknown };
  const arr = obj.slides;
  if (!Array.isArray(arr)) return null;

  const ZONES = new Set(["top", "center", "bottom"]);
  const ALIGNS = new Set(["left", "center", "right"]);
  const CONTRASTS = new Set(["light", "dark"]);

  const layouts: SlideLayout[] = [];
  for (const item of arr) {
    const s = item as Record<string, unknown>;
    const urutan = Number(s.urutan);
    const zone = String(s.zone ?? "center");
    const align = String(s.align ?? "center");
    const contrast = String(s.contrast ?? "light");
    if (!Number.isFinite(urutan)) continue;
    layouts.push({
      urutan,
      zone: ZONES.has(zone) ? (zone as LayoutZone) : "center",
      align: ALIGNS.has(align) ? (align as LayoutAlign) : "center",
      contrast: CONTRASTS.has(contrast) ? (contrast as LayoutContrast) : "light",
    });
  }

  // Jumlah/layout urutan tidak cocok → anggap halusinasi, fallback.
  if (layouts.length !== urutans.length) return null;
  const got = new Set(layouts.map((l) => l.urutan));
  if (!urutans.every((u) => got.has(u))) return null;

  return layouts;
}

/**
 * Ambil storageKey background dari media id (sudah resolve di carousel_job_slide).
 * Return null bila ada yang tidak bisa diakses — caller fallback template.
 */
export async function storageKeysForSlides(mediaIds: string[]): Promise<Map<string, string>> {
  if (!mediaIds.length) return new Map();
  const rows = await db
    .select({ id: media.id, storageKey: media.storageKey })
    .from(media)
    .where(and(inArray(media.id, mediaIds), eq(media.type, "image")));
  return new Map(rows.map((r) => [r.id, r.storageKey ?? ""]));
}

/** Template default — dipakai saat vision off / gagal (RFC §7 fallback) */
export function defaultLayout(urutan: number): SlideLayout {
  return { urutan, zone: "center", align: "center", contrast: "light" };
}
