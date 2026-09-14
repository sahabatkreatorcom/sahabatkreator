// Fetch wrapper ke API server dengan credentials (cookie auth)
import { env } from "@sahabatkreator/env/web";

const BASE_URL = env.VITE_SERVER_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
    try {
      const body = (await res.json()) as { message?: string; retryAfter?: number };
      if (body.message) message = body.message;
      if (typeof body.retryAfter === "number") retryAfter = body.retryAfter;
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

    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: "PUT", json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: "PATCH", json }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
};
