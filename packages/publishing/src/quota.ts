// Perekam kuota rate-limit API dari response header platform (data riil, bukan input manual)
// - Meta app-wide: `x-app-usage` — sinyal yang benar-benar memblokir kita
//   (batas `200 × daily active user` per jam, berlaku untuk SELURUH app)
// - Meta per use case: `x-business-use-case-usage` (BUC) — JSON per entitas
// - X-RateLimit-Remaining / X-RateLimit-Limit: pola umum LinkedIn/Pinterest
//   (Bluesky memakai nama tanpa prefix X-)
// Snapshot di-upsert per (entityId, quotaType, date) — idempotent.
//
// SATUAN: semua snapshot disimpan sebagai PERSEN dengan `total = 100`.
// MENGAPA: header Meta berisi persentase pemakaian, bukan jumlah call absolut.
// Kode lama memperlakukannya sebagai jumlah dan menghitung `200 - used`, sehingga
// kuota selalu terlihat "200/200 aman" (terbukti di DB produksi: 3 baris seumur
// hidup, semuanya remaining = total). Persen membuat arti kolom tidak ambigu dan
// cocok dengan perhitungan `usedPct` di halaman admin.
import { db } from "@sahabatkreator/db";
import { apiQuotaSnapshot } from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { setAppUsageRecorder } from "./http";
import { metaAppKeyForUrl, parseMetaAppUsage, parseMetaBucUsage } from "./rate-limits";

/** Semua snapshot kuota disimpan sebagai persen — lihat catatan satuan di atas. */
const PCT_TOTAL = 100;

/** ID generator lokal — hindari dependency ke apps/server */
function quotaId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return `sk_quota_${id}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Persen pemakaian → sisa kuota dalam skala 0–100 (dibulatkan, tidak negatif). */
function remainingPct(usedPct: number): number {
  return Math.max(0, PCT_TOTAL - Math.round(usedPct));
}

/** Upsert snapshot kuota (unique: entityId+quotaType+date) */
export async function recordQuotaSnapshot(input: {
  platform: string;
  entityId: string;
  quotaType: string;
  remaining: number;
  total: number;
}): Promise<void> {
  const date = todayISO();
  await db
    .insert(apiQuotaSnapshot)
    .values({
      id: quotaId(),
      platform: input.platform,
      entityId: input.entityId,
      quotaType: input.quotaType,
      remaining: input.remaining,
      total: input.total,
      date,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [apiQuotaSnapshot.entityId, apiQuotaSnapshot.quotaType, apiQuotaSnapshot.date],
      set: {
        remaining: input.remaining,
        total: input.total,
        syncedAt: new Date(),
      },
    });
}

/**
 * Ambil snapshot kuota terbaru per platform+entity (untuk preflight check).
 * Nilai `remaining`/`total` dalam PERSEN (total selalu 100).
 */
export async function getLatestQuota(
  platform: string,
  entityId: string,
): Promise<{ remaining: number; total: number; date: string } | null> {
  const [row] = await db
    .select({
      remaining: apiQuotaSnapshot.remaining,
      total: apiQuotaSnapshot.total,
      date: apiQuotaSnapshot.date,
    })
    .from(apiQuotaSnapshot)
    .where(and(eq(apiQuotaSnapshot.platform, platform), eq(apiQuotaSnapshot.entityId, entityId)))
    .orderBy(desc(apiQuotaSnapshot.date))
    .limit(1);
  return row ?? null;
}

/**
 * Rekam kuota dari response header platform.
 * Best-effort: error tidak boleh gagalkan publish — cukup log.
 *
 * `platform` dipakai untuk kuota per-akun/BUC; kuota app-wide punya jalur
 * sendiri (`recordAppUsage`) karena header-nya tidak menyebut platform mana pun.
 */
export async function recordQuotaFromHeaders(
  platform: string,
  entityId: string,
  headers: Headers,
): Promise<void> {
  try {
    // 1. Meta BUC — bisa memuat beberapa entitas dalam satu header. `type`
    //    (instagram/pages/messenger/…) dimasukkan ke quotaType karena tiap
    //    use case punya anggaran terpisah: menggabungkannya jadi satu baris
    //    "meta_buc" menyembunyikan bucket mana yang sebenarnya habis.
    for (const buc of parseMetaBucUsage(headers.get("x-business-use-case-usage"))) {
      await recordQuotaSnapshot({
        platform,
        entityId: buc.entityId,
        quotaType: buc.type ? `meta_buc_${buc.type}` : "meta_buc",
        remaining: remainingPct(buc.callCountPct),
        total: PCT_TOTAL,
      });
    }

    // 2. Pola X-RateLimit-* (LinkedIn: x-ratelimit-remaining, Pinterest: x-ratelimit-limit)
    //    Bluesky pakai nama tanpa prefix X- (ratelimit-remaining/ratelimit-limit).
    //    Bentuk ini SUDAH sisa/limit (bukan persen) → disimpan apa adanya.
    const remainingHeader =
      headers.get("x-ratelimit-remaining") ?? headers.get("ratelimit-remaining");
    const limitHeader = headers.get("x-ratelimit-limit") ?? headers.get("ratelimit-limit");
    if (remainingHeader !== null && limitHeader !== null) {
      const remaining = Number(remainingHeader);
      const total = Number(limitHeader);
      if (Number.isFinite(remaining) && Number.isFinite(total) && total > 0) {
        await recordQuotaSnapshot({
          platform,
          entityId,
          quotaType: "rate_limit",
          remaining,
          total,
        });
      }
    }
  } catch (error) {
    // Jangan pernah gagalkan publish karena pencatatan kuota gagal
    console.warn(`[quota] Gagal rekam kuota ${platform}/${entityId}:`, error);
  }
}

/**
 * Rekam kuota app-wide Meta dari header `x-app-usage`.
 *
 * Dipanggil `httpRequest` untuk SETIAP respons, jadi jalur sync (analytics,
 * posts, engagement, DM) ikut tercatat — sebelumnya hanya publish yang merekam,
 * padahal sync jauh lebih banyak memanggil API.
 *
 * `x-app-usage` tidak menyebut app mana; `metaAppKeyForUrl` memetakannya dari
 * host endpoint supaya anggaran tiap app (Facebook / Instagram Login / Threads)
 * tidak tercampur.
 */
function recordAppUsage(url: string, headers: Headers): void {
  const usage = parseMetaAppUsage(headers.get("x-app-usage"));
  if (!usage) return;
  // Fire-and-forget: pencatatan tidak boleh menahan/menggagalkan request.
  void recordQuotaSnapshot({
    platform: "meta",
    entityId: metaAppKeyForUrl(url),
    quotaType: "app_usage",
    remaining: remainingPct(usage.callCountPct),
    total: PCT_TOTAL,
  }).catch((error) => {
    console.warn("[quota] Gagal rekam x-app-usage:", error);
  });
}

// Pasang perekam ke lapisan HTTP. Modul ini dimuat lewat `index.ts` package
// publishing — worker dan server sama-sama mengimpornya, jadi keduanya otomatis
// merekam. Test yang mengimpor `http.ts`/`rate-limits.ts` langsung tidak
// memuat modul ini, sehingga tidak ada akses DB di dalam test.
setAppUsageRecorder(recordAppUsage);
