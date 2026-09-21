// Rate limiter in-memory (fixed window) per identitas IP + user session.
//
// CATATAN SKALABILITAS: penyimpanan in-memory hanya valid untuk server
// single-instance. Saat server dijalankan multi-instance di belakang load
// balancer, bucket tidak lagi terbagi — ganti ke penyimpanan terdistribusi
// (Redis, mis. pola INCR + EXPIRE atau sliding window) agar limit konsisten
// antar instance.
import { auth } from "@sahabatkreator/auth";
import type { Context, MiddlewareHandler } from "hono";
import { getClientIp } from "./audit";

type Bucket = {
  /** Jumlah request yang sudah masuk di window berjalan */
  count: number;
  /** Epoch ms saat window berakhir dan bucket di-reset */
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Sweep berkala menghapus bucket kedaluwarsa — tanpa ini, Map terus tumbuh
// mengikuti jumlah user/IP unik yang pernah request.
const CLEANUP_INTERVAL_MS = 2 * 60_000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
// Interval tidak boleh menahan event loop saat shutdown (server HTTP sudah
// menjaga process tetap hidup selama berjalan).
cleanupTimer.unref?.();

export type RateLimitOptions = {
  /** Panjang window dalam milidetik */
  windowMs: number;
  /** Maksimum request per window */
  max: number;
  /** Prefix bucket — memisahkan rule berbeda (mis. "api" vs "ai") */
  prefix: string;
  /** Lewati request tertentu (mis. /api/auth/* yang sudah dibatasi better-auth) */
  skip?: (c: Context) => boolean;
};

/**
 * Ambil satu token dari bucket (fixed window).
 * Return allowed=false bila kuota window habis, plus sisa detik untuk header
 * Retry-After.
 */
function takeToken(
  key: string,
  windowMs: number,
  max: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    // Window baru (belum ada bucket / window lama selesai)
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSec: 0 };
}

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
  return `ip:${getClientIp(c) ?? "unknown"}`;
}

/** Factory middleware rate limit — lihat RateLimitOptions untuk konfigurasi. */
export function rateLimitMiddleware(options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    if (options.skip?.(c)) {
      await next();
      return;
    }
    const identity = await resolveIdentity(c);
    const { allowed, retryAfterSec } = takeToken(
      `${options.prefix}:${identity}`,
      options.windowMs,
      options.max,
    );
    if (!allowed) {
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ message: "Terlalu banyak permintaan. Coba lagi dalam beberapa saat." }, 429);
    }
    await next();
  };
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
