// Shared layer bridge Repliz — auth Basic, wrapper request, dan sumber kredensial.
// Semua modul di folder ini memakai helper di sini; endpoint per-domain ada di
// file masing-masing (account, oauth, schedule, comment, content, chat,
// automation, report, research, addon).
// Docs: https://docs.repliz.com/api/introduction.html

import { db } from "@sahabatkreator/db";
import { bridgeConfig } from "@sahabatkreator/db/schema";
import { and, eq } from "drizzle-orm";
import { decrypt } from "../crypto";
import { type HttpResponse, httpRequest, throwFromResponse } from "../http";
import { PublishError } from "../types";

export const API_BASE = "https://api.repliz.com";

/** Kredensial Repliz (secret sudah plaintext — caller bertanggung jawab decrypt) */
export type ReplizCredentials = {
  accessKey: string;
  secretKey: string;
};

export function basicAuthHeader(cred: ReplizCredentials): string {
  return `Basic ${Buffer.from(`${cred.accessKey}:${cred.secretKey}`).toString("base64")}`;
}

/** Wrapper request dengan Basic Auth + error mapping ke PublishError */
export async function replizRequest<T>(
  cred: ReplizCredentials,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> } = {},
): Promise<T> {
  const res: HttpResponse<T> = await httpRequest<T>(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: basicAuthHeader(cred),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    query: options.query,
  });
  if (!res.ok) await throwFromResponse(res, `Repliz ${path}`);
  return res.json();
}

/** 204 No Content helper (delete/put/reconnect tidak mengembalikan body) */
export async function replizEmpty(
  cred: ReplizCredentials,
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> } = {},
): Promise<void> {
  const res = await httpRequest(`${API_BASE}${path}`, {
    method: options.method ?? "POST",
    query: options.query,
    headers: {
      Authorization: basicAuthHeader(cred),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) await throwFromResponse(res, `Repliz ${path}`);
}

/**
 * Kredensial bridge Repliz aktif dari DB (null bila bridge dimatikan admin atau
 * decrypt gagal). Sumber tunggal untuk semua konsumen bridge di package ini
 * (reply, dm-sync, auto-reply, posts-sync, analytics-sync).
 */
export async function replizActiveCredentials(): Promise<ReplizCredentials | null> {
  const [row] = await db
    .select()
    .from(bridgeConfig)
    .where(and(eq(bridgeConfig.provider, "repliz"), eq(bridgeConfig.isActive, true)))
    .limit(1);
  if (!row) return null;
  try {
    return { accessKey: row.accessKey, secretKey: decrypt(row.secretEnc) };
  } catch {
    return null;
  }
}

/** Helper publish error standar untuk response tanpa id */
export function replizMissingId(code: string, message: string, retryable: boolean): PublishError {
  return new PublishError(code, message, retryable);
}
