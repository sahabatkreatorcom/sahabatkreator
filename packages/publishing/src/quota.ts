// Perekam kuota rate-limit API dari response header platform (data riil, bukan input manual)
// - Meta (FB/IG/Threads): X-Business-Use-Case-Usage (BUC) — JSON per call_count/total_cputime/total_time
// - X-RateLimit-Remaining / X-RateLimit-Limit: pola umum LinkedIn/Pinterest
// Snapshot di-upsert per (entityId, quotaType, date) — idempotent.
import { db } from "@sahabatkreator/db";
import { apiQuotaSnapshot } from "@sahabatkreator/db/schema";
import { and, desc, eq } from "drizzle-orm";

interface BucEntry {
  call_count?: {
    total?: number;
    total_time?: number;
    estimated_time_to_regain_full_access?: number;
  };
  total_cputime?: { total?: number };
  total_time?: { total?: number };
}

interface BucPayload {
  [appIdOrEntity: string]: string | BucEntry;
}

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
 * Parse header X-Business-Use-Case-Usage Meta.
 * Format: {"<app_id>":[{"call_count":{"total":12,"total_time":60,"estimated_time_to_regain_full_access":350},"total_cputime":{...},"total_time":{...}}]}
 * Kita pakai call_count sebagai kuota utama (paling sering jadi bottleneck publish).
 */
export function parseMetaBucHeader(headerValue: string): {
  entityId: string;
  usedCalls: number;
} | null {
  try {
    const data = JSON.parse(headerValue) as BucPayload;
    for (const [entityId, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null) {
        // Bisa array of entry (format Graph API) atau object langsung
        const entries = Array.isArray(value) ? value : [value];
        const entry = entries[0] as BucEntry;
        if (entry?.call_count) {
          return { entityId, usedCalls: entry.call_count.total ?? 0 };
        }
      }
    }
  } catch {
    // header corrupt / format berubah — abaikan
  }
  return null;
}

/** Ambil snapshot kuota terbaru per platform+entity (untuk preflight check) */
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
 */
export async function recordQuotaFromHeaders(
  platform: string,
  entityId: string,
  headers: Headers,
): Promise<void> {
  try {
    // 1. Meta BUC header
    const buc = headers.get("x-business-use-case-usage");
    if (buc) {
      const parsed = parseMetaBucHeader(buc);
      if (parsed) {
        // Meta BUC: 100% = 200 calls/24 jam per app (Tier B). total = 200, remaining = 200 - used.
        const META_BUC_TOTAL = 200;
        const remaining = Math.max(META_BUC_TOTAL - parsed.usedCalls, 0);
        await recordQuotaSnapshot({
          platform,
          entityId: parsed.entityId,
          quotaType: "meta_buc",
          remaining,
          total: META_BUC_TOTAL,
        });
      }
    }

    // 2. Pola X-RateLimit-* (LinkedIn: x-ratelimit-remaining, Pinterest: x-ratelimit-limit)
    //    Bluesky pakai nama tanpa prefix X- (ratelimit-remaining/ratelimit-limit).
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
