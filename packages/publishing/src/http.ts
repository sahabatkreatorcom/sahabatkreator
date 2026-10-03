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
 * Perekam kuota app-wide (`x-app-usage`) untuk SEMUA panggilan HTTP platform.
 *
 * MENGAPA di lapisan ini: kuota adalah properti request HTTP, bukan properti
 * satu adapter. Sebelumnya hanya adapter publish yang merekam kuota, sementara
 * jalur sync (analytics, posts, engagement, DM) — pemakai API terbesar —
 * tidak tercatat sama sekali, sehingga pemakaian nyata kita tidak terlihat.
 *
 * Dipasang oleh `quota.ts` saat modul itu dimuat (worker & server mengimpor
 * `@sahabatkreator/publishing`, jadi otomatis aktif). Test yang mengimpor
 * `http.ts` langsung tidak mendapat perekam → tidak menyentuh DB.
 */
export type AppUsageRecorder = (url: string, headers: Headers) => void;
let appUsageRecorder: AppUsageRecorder | null = null;

/** Pasang/lepas perekam kuota app-wide. `null` = matikan. */
export function setAppUsageRecorder(recorder: AppUsageRecorder | null): void {
  appUsageRecorder = recorder;
}

/** Batas aman bilangan bulat JavaScript: 9.007.199.254.740.991 (16 digit). */
const MAX_SAFE_DIGITS = 16;

/**
 * JSON.parse yang mempertahankan bilangan bulat panjang sebagai STRING.
 *
 * TikTok mengembalikan id video sebagai ANGKA JSON — 19 digit, jauh di atas
 * Number.MAX_SAFE_INTEGER. JSON.parse membulatkannya lebih dulu, sehingga id
 * 7691614497802292487 menjadi 7691614497802292000 dan tautan "Lihat Post"
 * mengarah ke video yang tidak ada. Kerusakan ini TIDAK bisa diperbaiki setelah
 * parse — digitnya sudah hilang — jadi pencegahannya harus di lapisan ini.
 *
 * Bilangan ≥ 16 digit di posisi NILAI ditulis ulang menjadi string sebelum
 * parse. Pemindaian melacak apakah posisi sedang berada di dalam string,
 * supaya deretan angka yang kebetulan ada di dalam teks tidak ikut diubah.
 */
export function parseJsonPreservingBigIds(text: string): unknown {
  let out = "";
  let inString = false;
  let escaped = false;
  /** Karakter bermakna terakhir di LUAR string — penanda posisi nilai. */
  let prev = "";
  let i = 0;

  while (i < text.length) {
    const ch = text[i] as string;

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') {
        inString = false;
        prev = '"';
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      out += ch;
      i += 1;
      continue;
    }

    // Angka hanya berbahaya kalau berdiri sebagai NILAI: setelah ':' (nilai
    // objek), '[' (elemen pertama array), atau ',' (elemen berikutnya).
    if (ch >= "0" && ch <= "9" && (prev === ":" || prev === "[" || prev === ",")) {
      let end = i;
      while (end < text.length && (text[end] as string) >= "0" && (text[end] as string) <= "9") {
        end += 1;
      }
      const digits = text.slice(i, end);
      out += digits.length >= MAX_SAFE_DIGITS ? `"${digits}"` : digits;
      prev = "#"; // sebuah nilai baru saja selesai
      i = end;
      continue;
    }

    out += ch;
    prev = ch;
    i += 1;
  }

  return JSON.parse(out);
}

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

      // Kuota app-wide (`x-app-usage`) direkam untuk SEMUA panggilan — publish
      // maupun sync. Best-effort: kegagalan mencatat tidak pernah menggagalkan
      // request. `target` dipakai karena host-nya menandai app Meta mana yang
      // dipakai (lihat metaAppKeyForUrl).
      if (appUsageRecorder) {
        try {
          appUsageRecorder(target, res.headers);
        } catch {
          // pencatatan kuota tidak boleh menggagalkan request
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
      // json() dibungkus agar id panjang tidak kehilangan presisi — lihat
      // parseJsonPreservingBigIds. Body dibaca lewat text() lalu diparse sendiri.
      return {
        ok: res.ok,
        status: res.status,
        headers: res.headers,
        text: () => res.text(),
        json: async () => parseJsonPreservingBigIds(await res.text()) as T,
      } satisfies HttpResponse<T>;
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

/** Bentuk longgar body error platform — hanya field yang dibaca yang dideklarasikan. */
type PlatformErrorBody = {
  error?: {
    message?: string;
    code?: string | number;
    errors?: { message?: string }[];
  };
  error_description?: string;
  message?: string;
};

/** Ekstrak pesan error dari berbagai format response platform (Meta/Threads/TikTok/YouTube/LinkedIn) */
export async function extractErrorMessage(res: HttpResponse): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return `HTTP ${res.status}`;
  try {
    const data = JSON.parse(text) as PlatformErrorBody;
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
