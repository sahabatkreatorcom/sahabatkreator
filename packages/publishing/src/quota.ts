// Perekam kuota rate-limit API dari response header platform (data riil, bukan input manual)
// DUA jalur perekaman, dipisah menurut siapa yang tahu konteksnya:
//
// 1. TERPUSAT (`recordMetaQuotaFromResponse`, dipasang ke `httpRequest`) —
//    header Meta mendeskripsikan dirinya sendiri, jadi direkam untuk SEMUA
//    panggilan: publish maupun sync.
//      - `x-app-usage` — kuota APP-WIDE (`200 × daily active user` per jam),
//        batas yang benar-benar memblokir seluruh aplikasi.
//      - `x-business-use-case-usage` — kuota per use case (threads/instagram/
//        pages/messenger/…). Beberapa host HANYA mengirim header ini dan tidak
//        mengirim `x-app-usage` (graph.threads.net salah satunya), jadi cabang
//        ini wajib ada supaya pemakaian Threads ikut terlihat.
// 2. PER-PEMANGGIL (`recordQuotaFromHeaders`, dipakai adapter publish) —
//    pola umum `X-RateLimit-Remaining`/`X-RateLimit-Limit` (LinkedIn/Pinterest;
//    Bluesky tanpa prefix X-) yang butuh platform + entityId dari pemanggil.
//
// Snapshot di-upsert per (entityId, quotaType, date) — idempotent.
//
// SATUAN: snapshot Meta disimpan sebagai PERSEN dengan `total = 100`.
// MENGAPA: header Meta berisi persentase pemakaian, bukan jumlah call absolut.
// Kode lama memperlakukannya sebagai jumlah dan menghitung `200 - used`, sehingga
// kuota selalu terlihat "200/200 aman" (terbukti di DB produksi: 3 baris seumur
// hidup, semuanya remaining = total). Persen membuat arti kolom tidak ambigu dan
// cocok dengan perhitungan `usedPct` di halaman admin. Pola X-RateLimit-* tetap
// disimpan apa adanya karena memang berisi sisa/limit sungguhan.
import { db } from "@sahabatkreator/db";
import { apiQuotaSnapshot } from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { setMetaQuotaRecorder } from "./http";
import { metaQuotaSnapshots } from "./rate-limits";

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
 * Rekam kuota dari response header platform — pola umum `X-RateLimit-*`.
 *
 * Dipanggil adapter publish lewat `quotaHook`; pola ini butuh konteks pemanggil
 * (platform + entityId) karena headernya tidak menyebut dirinya sendiri.
 *
 * Kuota Meta TIDAK di sini: `x-app-usage` dan `x-business-use-case-usage` sudah
 * mendeskripsikan dirinya (entity + use case) sehingga direkam terpusat oleh
 * `recordMetaQuotaFromResponse` untuk SEMUA jalur — publish maupun sync.
 *
 * Best-effort: error tidak boleh gagalkan publish — cukup log.
 */
export async function recordQuotaFromHeaders(
  platform: string,
  entityId: string,
  headers: Headers,
): Promise<void> {
  try {
    // Pola X-RateLimit-* (LinkedIn: x-ratelimit-remaining, Pinterest: x-ratelimit-limit)
    // Bluesky pakai nama tanpa prefix X- (ratelimit-remaining/ratelimit-limit).
    // Bentuk ini SUDAH sisa/limit (bukan persen) → disimpan apa adanya.
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
 * Rekam kuota Meta dari response header — dijalankan `httpRequest` untuk SETIAP
 * respons, sehingga jalur sync (analytics, posts, engagement, DM) ikut tercatat.
 * Sebelumnya hanya publish yang merekam, padahal sync jauh lebih banyak
 * memanggil API — jadi pemakaian nyata kita tidak terlihat sama sekali.
 *
 * Dua header ditangani, dan keduanya mendeskripsikan dirinya sendiri:
 *
 * - `x-app-usage` → kuota APP-WIDE (`200 × daily active user` per jam). Ini batas
 *   yang benar-benar memblokir seluruh aplikasi. Header-nya tidak menyebut app
 *   mana; `metaAppKeyForUrl` memetakannya dari host endpoint supaya anggaran
 *   Facebook / Instagram Login / Threads tidak tercampur.
 * - `x-business-use-case-usage` → kuota per use case, berisi entity + `type`
 *   (threads/instagram/pages/messenger/…). PENTING: beberapa host hanya mengirim
 *   header ini dan TIDAK mengirim `x-app-usage` — graph.threads.net salah
 *   satunya — sehingga tanpa cabang ini pemakaian Threads tidak terlihat.
 *
 * Best-effort: kegagalan mencatat tidak pernah menggagalkan request.
 */
function recordMetaQuotaFromResponse(url: string, headers: Headers): void {
  for (const snapshot of metaQuotaSnapshots(url, headers)) {
    // Fire-and-forget: pencatatan tidak boleh menahan/menggagalkan request.
    void recordQuotaSnapshot(snapshot).catch((error) => {
      console.warn(`[quota] Gagal rekam kuota ${snapshot.platform}/${snapshot.entityId}:`, error);
    });
  }
}

// Pasang perekam ke lapisan HTTP. Modul ini dimuat lewat `index.ts` package
// publishing — worker dan server sama-sama mengimpornya, jadi keduanya otomatis
// merekam. Test yang mengimpor `http.ts`/`rate-limits.ts` langsung tidak
// memuat modul ini, sehingga tidak ada akses DB di dalam test.
setMetaQuotaRecorder(recordMetaQuotaFromResponse);
