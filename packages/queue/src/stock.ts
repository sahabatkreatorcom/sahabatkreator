// Stock image source — adapter untuk sourcing background carousel (RFC §6).
//
// ToS (diverifikasi 24 Sep 2026):
// - Pixabay: komersial OK, attribution TIDAK wajib, tapi hotlink dilarang →
//   WAJIB download ke server lalu upload ke R2. Itu yang dilakukan modul ini.
// - Pexels: attribution diharapkan; credit ditulis ke caption, bukan dibakar
//   di slide (fase 2).
//
// Dedup: contentHash background (sudah ada kolomnya di tabel media). Background
// yang sama pernah di-download → reuse media row, tidak fetch ulang. Ini juga
// yang membuat "pool background bersama" antar org bekerja.

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@sahabatkreator/db";
import { media } from "@sahabatkreator/db/schema";
import { env } from "@sahabatkreator/env/server";
import { and, eq } from "drizzle-orm";

/** Hasil pencarian stock — ringkasan untuk UI picker */
export type StockImageResult = {
  id: string;
  url: string;
  width: number;
  height: number;
  /** URL versi kecil untuk preview (hotlink preview diizinkan: tampilan sementara) */
  previewUrl: string;
  user: string;
  tags: string[];
};

/** Background yang sudah berada di R2 + terdaftar di media library */
export type SourcedBackground = {
  mediaId: string;
  storageKey: string;
  /** Credit untuk caption (mis. "Photo by john doe on Pixabay") */
  credit: string | null;
};

/** Adapter sumber stock image */
export interface StockImageSource {
  readonly name: string;
  /** Cari gambar berdasarkan query + orientasi. Return kosong = tidak ada hasil. */
  search(
    query: string,
    opts: { orientation: "portrait" | "landscape" | "square"; perPage?: number },
  ): Promise<StockImageResult[]>;
  /**
   * Download satu gambar dari sumber, upload ke R2, daftarkan ke media library.
   * Idempoten via contentHash: bila sudah ada → reuse, tidak download ulang.
   */
  source(
    result: StockImageResult,
    opts: { organizationId: string; orientation: "portrait" | "landscape" | "square" },
  ): Promise<SourcedBackground>;
}

// ============================================================
// R2 upload helper (pola sama dengan render-processor, tanpa presign —
// worker upload langsung lewat SDK; presign hanya untuk Modal container).
// ============================================================
let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET
    ) {
      throw new Error("R2 belum dikonfigurasi — stock sourcing butuh storage");
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

// ============================================================
// Pixabay — https://pixabay.com/api/docs/
// ============================================================
const PIXABAY_BASE = "https://pixabay.com/api/";

/** Cache search in-memory (TTL 5 menit) — kurangi hit API untuk query populer */
const searchCache = new Map<string, { at: number; rows: StockImageResult[] }>();
const SEARCH_TTL_MS = 5 * 60 * 1000;

export class PixabaySource implements StockImageSource {
  readonly name = "pixabay";

  private get apiKey(): string {
    if (!env.PIXABAY_KEY) throw new Error("PIXABAY_KEY belum dikonfigurasi");
    return env.PIXABAY_KEY;
  }

  async search(
    query: string,
    opts: { orientation: "portrait" | "landscape" | "square"; perPage?: number },
  ): Promise<StockImageResult[]> {
    const perPage = Math.min(20, Math.max(3, opts.perPage ?? 8));
    const cacheKey = `${query}|${opts.orientation}|${perPage}`;
    const hit = searchCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.rows;

    const url =
      `${PIXABAY_BASE}?key=${encodeURIComponent(this.apiKey)}` +
      `&q=${encodeURIComponent(query)}` +
      `&orientation=${opts.orientation === "square" ? "all" : opts.orientation}` +
      `&image_type=photo&safesearch=true&per_page=${perPage}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Pixabay search error HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`,
      );
    }
    const json = (await res.json()) as {
      total?: number;
      hits?: Array<{
        id: number;
        largeImageURL: string;
        previewURL: string;
        imageWidth: number;
        imageHeight: number;
        user: string;
        tags: string;
      }>;
    };

    const rows: StockImageResult[] = (json.hits ?? []).map((h) => ({
      id: `pixabay_${h.id}`,
      url: h.largeImageURL,
      previewUrl: h.previewURL,
      width: h.imageWidth,
      height: h.imageHeight,
      user: h.user,
      tags: h.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    }));

    searchCache.set(cacheKey, { at: Date.now(), rows });
    return rows;
  }

  async source(
    result: StockImageResult,
    opts: { organizationId: string; orientation: "portrait" | "landscape" | "square" },
  ): Promise<SourcedBackground> {
    const credit = `Photo by ${result.user} on Pixabay`;
    // Dedup key stabil: id stock global unik. (contentHash tabel media dipakai
    // untuk dedup upload user; untuk stock kita simpan key deterministik ini.)
    const dedupKey = `stock:${result.id}`;

    // 1. Skip download+upload bila background ini sudah pernah di-pool ke R2.
    const [existing] = await db
      .select({ storageKey: media.storageKey })
      .from(media)
      .where(and(eq(media.contentHash, dedupKey), eq(media.source, "stock_pixabay")))
      .limit(1);

    let storageKey: string;
    let sizeBytes: number;
    if (existing?.storageKey) {
      storageKey = existing.storageKey;
      sizeBytes = 0; // tidak fetch ulang — file fisik sama, ukuran tidak penting di sini
    } else {
      // 2. Download dari Pixabay (ToS: no hotlink → harus disimpan di server).
      const res = await fetch(result.url);
      if (!res.ok) throw new Error(`Gagal download stock ${result.id}: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      sizeBytes = buf.byteLength;

      // 3. Upload ke R2 (pool bersama — org manapun boleh pakai background ini).
      const datePrefix = `stock/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`;
      storageKey = `${datePrefix}/${result.id}.jpg`;
      await getS3().send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: storageKey,
          Body: new Uint8Array(buf),
          ContentType: "image/jpeg",
        }),
      );
    }

    // 4. Daftarkan ke media library org ini (source/credit = lineage compliance).
    // Media row per org supaya library org-scoped; storageKey-nya dibagikan.
    const mediaId = `sk_media_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.insert(media).values({
      id: mediaId,
      organizationId: opts.organizationId,
      name: `${result.tags.slice(0, 3).join(" ") || "stock"} (${result.id})`,
      type: "image",
      storageKey,
      url: `${env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/${storageKey}`,
      mimeType: "image/jpeg",
      sizeBytes,
      width: result.width,
      height: result.height,
      contentHash: dedupKey,
      source: "stock_pixabay",
      credit,
    });

    return { mediaId, storageKey, credit };
  }
}

/** Adapter stock aktif, atau null bila PIXABAY_KEY belum diset */
export function getStockSource(): StockImageSource | null {
  if (!env.PIXABAY_KEY) return null;
  return new PixabaySource();
}

/** true bila sourcing stock aktif (UI gating) */
export function isStockConfigured(): boolean {
  return Boolean(env.PIXABAY_KEY);
}
