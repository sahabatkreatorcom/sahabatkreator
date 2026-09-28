// Fetch wrapper ke API server dengan credentials (cookie auth)
import { env } from "@sahabatkreator/env/web";

const BASE_URL = env.VITE_SERVER_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Kode error aplikasi dari body (mis. tiktok_spam_risk_too_many_posts) */
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Timestamp terakhir kali kena rate-limit (429) — module-level, dipakai banner global
let lastRateLimitedAt: number | null = null;

/** Waktu (Date.now()) request terakhir yang kena 429, null bila belum pernah */
export function getLastRateLimitedAt(): number | null {
  return lastRateLimitedAt;
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "include",
  });

  if (!res.ok) {
    let message = `Request gagal (${res.status})`;
    let retryAfter: number | undefined;
    let code: string | undefined;
    try {
      const body = (await res.json()) as {
        message?: string;
        retryAfter?: number;
        code?: string;
      };
      if (body.message) message = body.message;
      if (typeof body.retryAfter === "number") retryAfter = body.retryAfter;
      if (typeof body.code === "string") code = body.code;
    } catch {
      // biarkan default message
    }

    // Rate-limit: catat timestamp + broadcast event agar UI bisa menampilkan banner
    if (res.status === 429) {
      // Default message 429 bila body tidak menyertakan message spesifik
      if (message === "Request gagal (429)") {
        message = "Terlalu banyak permintaan — tunggu sebentar lalu coba lagi";
      }
      lastRateLimitedAt = Date.now();
      window.dispatchEvent(new CustomEvent("sk-ratelimited", { detail: { retryAfter } }));
    }

    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  const body = await res.text();
  if (!body.trim()) {
    throw new ApiError(res.status, "Server mengembalikan response kosong");
  }
  return JSON.parse(body) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: "PUT", json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: "PATCH", json }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),

  /**
   * Upload multipart dengan progress callback (XHR — fetch tidak punya
   * upload progress). `onProgress` dipanggil dengan persentase 0-100.
   */
  uploadWithProgress: <T>(
    path: string,
    formData: FormData,
    onProgress: (percent: number) => void,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE_URL}/api${path}`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          if (xhr.status === 204) {
            resolve(undefined as T);
            return;
          }
          try {
            resolve(JSON.parse(xhr.responseText) as T);
          } catch {
            reject(new ApiError(xhr.status, "Server mengembalikan response kosong"));
          }
          return;
        }

        let message = `Request gagal (${xhr.status})`;
        let code: string | undefined;
        try {
          const body = JSON.parse(xhr.responseText) as { message?: string; code?: string };
          if (body.message) message = body.message;
          if (typeof body.code === "string") code = body.code;
        } catch {
          // biarkan default message
        }
        if (xhr.status === 429) {
          lastRateLimitedAt = Date.now();
          window.dispatchEvent(new CustomEvent("sk-ratelimited", { detail: {} }));
        }
        reject(new ApiError(xhr.status, message, code));
      };

      xhr.onerror = () => reject(new ApiError(0, "Upload gagal — jaringan terputus"));
      xhr.onabort = () => reject(new ApiError(0, "Upload dibatalkan"));

      xhr.send(formData);
    }),
};
