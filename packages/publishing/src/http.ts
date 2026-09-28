// HTTP helper untuk adapter platform — fetch dengan timeout, retry 429/5xx, error parsing
import { PublishError } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

export type HttpOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | FormData | Blob | ArrayBuffer;
  query?: Record<string, string | number | boolean | string[] | undefined>;
  timeoutMs?: number;
  /** Max retry otomatis untuk 429/5xx (default 2, backoff dari Retry-After header) */
  retries?: number;
  /** Callback per-response (dipakai merekam kuota rate-limit dari header platform) */
  onResponse?: (res: HttpResponse) => void;
};

export type HttpResponse<T = unknown> = {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<T>;
  text(): Promise<string>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse header Retry-After — dukung dua format:
 * - detik: "120"
 * - HTTP-date: "Wed, 21 Oct 2026 07:28:00 GMT"
 * Return ms (min 0) atau null bila tidak valid.
 */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds > 0) return asSeconds * 1000;
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

export { parseRetryAfterMs };

/**
 * Fetch wrapper untuk API platform.
 * - Timeout via AbortController
 * - Auto-retry 429/500/502/503/504 + network error (backoff eksponensial + jitter, hormati Retry-After)
 * - Parse error response Meta/TikTok umum untuk message yang jelas
 */
export async function httpRequest<T = unknown>(
  url: string,
  options: HttpOptions = {},
): Promise<HttpResponse<T>> {
  const {
    method = "GET",
    headers,
    body,
    query,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
    onResponse,
  } = options;

  let target = url;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      // Nilai array (mis. scheduleIds[]) → repeat key per elemen. Pakai append,
      // BUKAN set: set hanya menyimpan nilai terakhir (silent data loss).
      if (Array.isArray(v)) {
        for (const item of v) if (item !== undefined) qs.append(k, String(item));
      } else {
        qs.set(k, String(v));
      }
    }
    target = `${url}${url.includes("?") ? "&" : "?"}${qs.toString()}`;
  }

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target, { method, headers, body, signal: controller.signal });

      // Rekam kuota rate-limit dari header platform (best-effort, tidak blocking)
      if (onResponse) {
        try {
          onResponse(res as HttpResponse);
        } catch {
          // callback tidak boleh gagalkan request
        }
      }

      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        if (attempt < retries) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
          const backoff = retryAfterMs ?? 1000 * 2 ** attempt + Math.random() * 500; // backoff + jitter
          await sleep(Math.min(backoff, 30_000));
          continue;
        }
      }
      return res as HttpResponse<T>;
    } catch (error) {
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt + Math.random() * 500);
        continue;
      }
      throw new PublishError(
        "network_error",
        `Gagal terhubung ke platform: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Download media dari storage (R2) dengan validasi status + timeout + retry.
 * Tanpa ini, blob error-page XML/HTML dari storage bisa terkirim ke platform
 * sebagai "media" (fetch tidak melempar error pada 403/404/5xx).
 */
export async function downloadMedia(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ArrayBuffer> {
  const MAX_RETRIES = 2;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        if (attempt < MAX_RETRIES && (res.status >= 500 || res.status === 429)) {
          await sleep(1000 * 2 ** attempt + Math.random() * 500);
          continue;
        }
        throw new PublishError(
          "media_fetch_failed",
          `Gagal mengunduh media dari storage (${res.status})`,
          true,
        );
      }
      return await res.arrayBuffer();
    } catch (error) {
      if (error instanceof PublishError) throw error;
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt + Math.random() * 500);
        continue;
      }
      throw new PublishError(
        "media_fetch_failed",
        `Gagal mengunduh media dari storage: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }
}

/** Varian downloadMedia yang mengembalikan Blob (untuk FormData/body upload). */
export async function downloadMediaBlob(url: string, timeoutMs?: number): Promise<Blob> {
  const bytes = await downloadMedia(url, timeoutMs);
  return new Blob([bytes]);
}

/**
 * Upload binary (PUT/POST body Buffer/ArrayBuffer) dengan timeout + retry.
 * Jalur paling rawan kegagalan transien — jangan pakai fetch mentah.
 */
export async function httpUpload(
  url: string,
  options: {
    method?: string;
    body: ArrayBuffer | Blob | FormData;
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
  },
): Promise<Response> {
  const { method = "PUT", body, headers, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        if (attempt < retries) {
          const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
          await sleep(Math.min(retryAfterMs ?? 1000 * 2 ** attempt, 30_000));
          continue;
        }
      }
      return res;
    } catch (error) {
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt + Math.random() * 500);
        continue;
      }
      throw new PublishError(
        "upload_failed",
        `Upload ke platform gagal: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
  }
}

/** Ekstrak pesan error dari berbagai format response platform (Meta/Threads/TikTok/YouTube/LinkedIn) */
export async function extractErrorMessage(res: HttpResponse): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return `HTTP ${res.status}`;
  try {
    const data = JSON.parse(text) as Record<string, any>;
    // Meta: { error: { message, code, error_subcode } } — sertakan code utk trace ke support platform
    if (data.error?.message) {
      return `[${data.error.code ?? res.status}] ${data.error.message}`;
    }
    if (data.error_description) return String(data.error_description);
    // LinkedIn / YouTube / generic
    if (data.message) return String(data.message);
    if (data.error?.errors?.[0]?.message) return String(data.error.errors[0].message);
  } catch {
    // bukan JSON
  }
  return text.slice(0, 300);
}

/** Throw PublishError dari response non-2xx dengan mapping retryable */
export async function throwFromResponse(res: HttpResponse, context: string): Promise<never> {
  const message = await extractErrorMessage(res);
  const retryable =
    res.status === 429 ||
    (res.status >= 500 && res.status <= 504) ||
    res.status === 408 ||
    res.status === 0;
  throw new PublishError(`http_${res.status}`, `${context}: ${message}`, retryable);
}
