// Helper bersama untuk admin API test suites & trigger izin (App Review).
// Dipakai oleh admin-api-tests.ts (suite platform) dan admin-api-test-triggers.ts.

import { db } from "@sahabatkreator/db";
import { socialAccount } from "@sahabatkreator/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "../lib/crypto";

/** Fetch JSON dengan timeout — jangan biarkan Graph API menggantung request admin */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {
      // body bukan JSON (mis. html error page) — biarkan null
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil user token tersimpan (akun social pertama platform tsb, decrypt).
 * Return null bila belum ada akun terhubung.
 */
export async function getStoredUserToken(platform: string): Promise<string | null> {
  const [account] = await db
    .select({ accessTokenEnc: socialAccount.accessTokenEnc })
    .from(socialAccount)
    .where(eq(socialAccount.platform, platform as never))
    .limit(1);
  if (!account?.accessTokenEnc) return null;
  try {
    return decrypt(account.accessTokenEnc);
  } catch {
    return null;
  }
}
