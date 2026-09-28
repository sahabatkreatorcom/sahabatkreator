// Rate limiter per identitas IP + user session.
//
// MENGGUNAKAN REDIS bila REDIS_URL diset (multi-instance di belakang load
// balancer → bucket tetap konsisten lintas instance, sliding window via ZSET
// + Lua). Tanpa REDIS_URL, fallback ke in-memory fixed window (hanya valid
// untuk single-instance — lihat catatan lama di bawah).
//
// Fail-open: jika Redis error saat menghitung bucket (koneksi drop, timeout),
// request DIIZINKAN dan dicatat. Rate limit adalah proteksi kebijakan, bukan
// gerbang keamanan — memblokir semua traffic karena Redis mati lebih buruk
// daripada melewati beberapa request berlebih.
//
// CATATAN LAMA (in-memory): penyimpanan in-memory hanya valid untuk server
// single-instance. Sweep berkala menghapus bucket kedaluwarsa — tanpa ini,
// Map terus tumbuh mengikuti jumlah user/IP unik yang pernah request.
import { auth } from "@sahabatkreator/auth";
import { env } from "@sahabatkreator/env/server";
import type { Context, MiddlewareHandler } from "hono";
import { getClientIp } from "./audit";

type HitResult = { allowed: boolean; retryAfterSec: number };

interface RateLimitStore {
  /** Ambil satu token; return allowed=false bila kuota window habis. */
  hit(key: string, windowMs: number, max: number): Promise<HitResult>;
  /** Tutup koneksi (hanya Redis store; no-op untuk memory). */
  close?(): Promise<void>;
}

// --------------------------------------------------------------------------
// Store in-memory (fallback single-instance)
// --------------------------------------------------------------------------

type Bucket = {
  /** Jumlah request yang sudah masuk di window berjalan */
  count: number;
  /** Epoch ms saat window berakhir dan bucket di-reset */
  resetAt: number;
};

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  constructor() {
    const CLEANUP_INTERVAL_MS = 2 * 60_000;
    const cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(key);
      }
    }, CLEANUP_INTERVAL_MS);
    // Interval tidak boleh menahan event loop saat shutdown (server HTTP
    // sudah menjaga process tetap hidup selama berjalan).
    cleanupTimer.unref?.();
  }

  hit(key: string, windowMs: number, max: number): Promise<HitResult> {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return Promise.resolve({ allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) });
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return Promise.resolve({
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      });
    }
    return Promise.resolve({ allowed: true, retryAfterSec: 0 });
  }
}

// --------------------------------------------------------------------------
// Store Redis (sliding window via sorted set + Lua — atomic lintas instance)
// --------------------------------------------------------------------------

// Member ZSET = "<nowMs>:<nonce>" (nonce mencegah dua hit di ms yang sama
// saling menimpa). Skor = timestamp hit.
const LUA_SLIDING_WINDOW = `local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local nonce = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = tonumber(oldest[2] or now) + window
  return {0, math.max(1, math.ceil((resetAt - now) / 1000))}
end
redis.call('ZADD', key, now, now .. ':' .. nonce)
redis.call('PEXPIRE', key, window)
return {1, 0}`;

// Type-only import: ioredis hanya di-load saat REDIS_URL ada (lihat getStore),
// tipenya tetap tersedia untuk pengecekan compile-time tanpa membengkakkan bundle.
import type IORedis from "ioredis";

class RedisRateLimitStore implements RateLimitStore {
  private readonly redis: IORedis;

  constructor(
    url: string,
    ioredis: new (url: string, options?: Record<string, unknown>) => IORedis,
  ) {
    // Rate limiter tidak butuh retry panjang — gagal cepat, caller fail-open.
    this.redis = new ioredis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  async hit(key: string, windowMs: number, max: number): Promise<HitResult> {
    const now = Date.now();
    const nonce = Math.random().toString(36).slice(2, 10);
    const result = (await this.redis.eval(
      LUA_SLIDING_WINDOW,
      1,
      `sk_rl:${key}`,
      now,
      windowMs,
      max,
      nonce,
    )) as [number, number] | null;
    if (!result) return { allowed: true, retryAfterSec: 0 };
    const retryAfter = result[1] ?? Math.ceil(windowMs / 1000);
    return { allowed: result[0] === 1, retryAfterSec: retryAfter };
  }

  close(): Promise<void> {
    return this.redis.quit().then(() => undefined);
  }
}

let store: RateLimitStore | null = null;

/**
 * Store aktif. Dipilih sekali (REDIS_URL ada/tidak) — ganti store butuh
 * restart server. Redis yang gagal connect saat init → memory store + error
 * dicatat, bukan crash.
 */
async function getStore(): Promise<RateLimitStore> {
  if (store) return store;
  if (env.REDIS_URL) {
    try {
      // Lazy import: ioredis hanya dibutuhkan bila REDIS_URL ada, dan tidak
      // boleh masuk bundle worker/MCP yang tidak pakai rate limit.
      const ioredis = (await import("ioredis")).default;
      store = new RedisRateLimitStore(env.REDIS_URL, ioredis);
    } catch (error) {
      console.error("[rate-limit] Redis init gagal, fallback ke in-memory:", error);
      store = new MemoryRateLimitStore();
    }
  } else {
    store = new MemoryRateLimitStore();
  }
  return store;
}

/** true bila store aktif adalah Redis (dipakai metrik/diagnostik). */
export function isRateLimitDistributed(): boolean {
  return Boolean(env.REDIS_URL && store instanceof RedisRateLimitStore);
}

export type RateLimitOptions = {
  /** Panjang window dalam milidetik */
  windowMs: number;
  /** Maksimum request per window */
  max: number;
  /** Prefix bucket — memisahkan rule berbeda (mis. "api" vs "ai") */
  prefix: string;
  /** Lewati request tertentu (mis. /api/auth/* yang sudah dibatasi better-auth) */
  skip?: (c: Context) => boolean;
  /**
   * Identitas kustom — dipakai bila ada, mis. `key:<id>` untuk Public API
   * (/v1) yang tidak punya session. Return undefined → jatuh ke identitas
   * default (session / IP).
   */
  identity?: (c: Context) => string | undefined;
  /**
   * Bentuk respons saat kuota habis. Default `{message}` — cukup untuk REST,
   * tapi endpoint berprotokol sendiri (mis. JSON-RPC di /mcp) butuh bentuk
   * pesannya sendiri supaya klien bisa mem-parse kegagalan dengan benar.
   */
  onLimited?: (c: Context, retryAfterSec: number) => Response;
};

/**
 * Identitas rate limit: user terautentikasi (limit per user lintas perangkat),
 * fallback IP untuk request tanpa session (mis. endpoint publik).
 * Kegagalan getSession (DB blip) tidak boleh menggagalkan request — fallback IP.
 */
async function resolveIdentity(c: Context): Promise<string> {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user?.id) return `user:${session.user.id}`;
  } catch {
    // fallback ke IP di bawah
  }
  const ip = getClientIp(c) ?? "unknown";
  return `ip:${ip}`;
}

/** Factory middleware rate limit — lihat RateLimitOptions untuk konfigurasi. */
export function rateLimitMiddleware(options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    if (options.skip?.(c)) {
      await next();
      return;
    }
    const identity = options.identity?.(c) ?? (await resolveIdentity(c));
    let result: HitResult;
    try {
      result = await (await getStore()).hit(
        `${options.prefix}:${identity}`,
        options.windowMs,
        options.max,
      );
    } catch (error) {
      // Fail-open: Redis sehat saat init tapi error saat hit (failover, OOM).
      console.error("[rate-limit] store hit gagal, mengizinkan request:", error);
      await next();
      return;
    }
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSec));
      if (options.onLimited) return options.onLimited(c, result.retryAfterSec);
      return c.json({ message: "Terlalu banyak permintaan. Coba lagi dalam beberapa saat." }, 429);
    }
    await next();
  };
}

/** Tutup koneksi store (dipanggil graceful shutdown di index.ts). */
export async function closeRateLimitStore(): Promise<void> {
  await store?.close?.();
  store = null;
}

/**
 * Preset API global: 100 request / 60 detik per IP+user.
 * /api/auth/* di-skip — better-auth punya rate limit internal sendiri
 * (opsi rateLimit di packages/auth) untuk brute-force login/signup.
 */
export const globalApiRateLimit = rateLimitMiddleware({
  windowMs: 60_000,
  max: 100,
  prefix: "api",
  skip: (c) => c.req.path.startsWith("/api/auth/"),
});

/**
 * Preset route AI: 10 request / 60 detik per IP+user.
 * Endpoint /usage di-skip — read-only sisa kredit (murah, dipolling UI),
 * pembatasan ketat hanya untuk endpoint generatif yang memanggil LLM.
 * /predict-score juga di-skip — murni rule-based tanpa LLM, dipanggil
 * live saat mengetik di Compose (bukan kuota AI).
 */
export const aiRateLimit = rateLimitMiddleware({
  windowMs: 60_000,
  max: 10,
  prefix: "ai",
  skip: (c) => c.req.path.endsWith("/ai/usage") || c.req.path.endsWith("/ai/predict-score"),
});
