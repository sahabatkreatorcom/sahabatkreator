// Middleware Public API (/v1) — verifikasi token, gate plan, rate limit, scope.
//
// Urutan (dipasang berurutan di index.ts):
//   1. verifyApiKey     → 401 bila token tidak ada/tidak valid
//   2. publicApiRateLimit → 429 per key (bucket terpisah dari /api)
//   3. publicApiPlanGate  → 402 bila plan tanpa api_access / api_write
//   4. requireScope(...)  → 403 per route bila key tidak punya scope
//
// Setelah (1), context diisi ke c.set("apiKeyAuth") sehingga getAuthContext()
// di auth-guard.ts mengembalikannya — semua guard lama (requireOrg dkk.)
// bekerja tanpa perubahan.

import type { ApiKeyScope } from "@sahabatkreator/db/schema";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { extractApiKey, verifyApiKey } from "./api-key";
import { type AuthContext, errorResponse, HTTPError } from "./auth-guard";
import { checkPlanFeature } from "./billing";
import { rateLimitMiddleware } from "./rate-limit";

declare module "hono" {
  interface ContextVariableMap {
    /** AuthContext hasil verifyApiKey — dibaca getAuthContext() */
    apiKeyAuth: AuthContext;
    /** Identitas key aktif (id, scopes) — dibaca requireScope & rate limit */
    apiKey: NonNullable<Awaited<ReturnType<typeof verifyApiKey>>>["key"];
  }
}

/** Key fitur public API (harus sinkron dengan seed + feature-catalog). */
export const API_FEATURES = {
  /** Akses /v1 sama sekali — plan non-Free */
  access: "api_access",
  /** Endpoint write (POST/PATCH/PUT/DELETE) — Business & Enterprise */
  write: "api_write",
  /** Webhook keluar (delivery event org) — Enterprise */
  webhook: "api_webhook",
} as const;

/** Method yang tidak mengubah data — lolos gate api_write. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Verifikasi token: 401 bila tidak ada / tidak valid. */
export const verifyApiKeyMiddleware: MiddlewareHandler = async (c, next) => {
  const raw = extractApiKey(c.req.raw.headers);
  const auth = await verifyApiKey(raw);
  if (!auth) {
    return c.json(
      { message: "API key tidak valid atau sudah dicabut. Buat key baru di Settings → API." },
      401,
    );
  }
  c.set("apiKeyAuth", auth.context);
  c.set("apiKey", auth.key);
  await next();
};

/**
 * Rate limit per key (60 req/60 detik). Identity sengaja memakai key ID
 * (bukan IP/user) — klien eksternal berbagi IP egress, jadi limit per IP
 * akan saling menimpa antar pelanggan.
 */
export const publicApiRateLimit = rateLimitMiddleware({
  windowMs: 60_000,
  max: 60,
  prefix: "v1",
  identity: (c) => {
    const key = c.get("apiKey");
    return key ? `key:${key.id}` : undefined;
  },
});

/** Gate plan: api_access untuk semua method, api_write untuk method tulis. */
export const publicApiPlanGate: MiddlewareHandler = async (c, next) => {
  const auth = c.get("apiKeyAuth");
  if (!auth?.organization) {
    return c.json({ message: "API key tidak terikat organisasi aktif" }, 403);
  }
  try {
    await checkPlanFeature(auth.organization.id, API_FEATURES.access);
    if (!SAFE_METHODS.has(c.req.method)) {
      await checkPlanFeature(auth.organization.id, API_FEATURES.write);
    }
  } catch (error) {
    return errorResponse(error);
  }
  await next();
};

/**
 * Gate plan untuk `/mcp` — HANYA `api_access`, tanpa gate tulis.
 *
 * MENGAPA tidak memakai publicApiPlanGate: MCP menyalurkan SEMUA tool lewat
 * satu method HTTP (POST), jadi gate berbasis method akan menuntut `api_write`
 * (Business+) bahkan untuk tool baca seperti `list_posts`. Gate tulis yang
 * benar dipasang oleh subrequest internal ke `/v1/<path>` — di sana method
 * aslinya (GET/POST/…) sudah dipulihkan, sehingga `api_write` hanya berlaku
 * untuk tool yang memang menulis.
 */
export const publicApiAccessGate: MiddlewareHandler = async (c, next) => {
  const auth = c.get("apiKeyAuth");
  if (!auth?.organization) {
    return c.json({ message: "API key tidak terikat organisasi aktif" }, 403);
  }
  try {
    await checkPlanFeature(auth.organization.id, API_FEATURES.access);
  } catch (error) {
    return errorResponse(error);
  }
  await next();
};

/** Gate scope per route: 403 bila key tidak diberi scope tersebut. */
export function requireScope(scope: ApiKeyScope): MiddlewareHandler {
  return async (c, next) => {
    const key = c.get("apiKey");
    if (!key) {
      return c.json({ message: "API key diperlukan" }, 401);
    }
    if (!key.scopes.includes(scope)) {
      return c.json(
        {
          message: `Key ini tidak memiliki scope "${scope}". Buat key baru dengan scope tersebut.`,
        },
        403,
      );
    }
    await next();
  };
}

/**
 * Penangan error /v1 — memetakan exception yang lolos dari handler.
 * Handler lama memang punya try/catch sendiri (menghasilkan {message} +
 * status yang benar), jadi yang sampai ke sini hanya exception tak tertangkap:
 * Hono HTTPException (body/form rusak), SyntaxError (JSON invalid), dan
 * HTTPError/HTTPError custom dari guard.
 */
export function publicApiOnError(error: unknown, c: Context): Response {
  if (error instanceof HTTPException) {
    return c.json({ message: error.message }, error.status);
  }
  if (error instanceof SyntaxError) {
    return c.json({ message: "Body request tidak valid (JSON rusak)" }, 400);
  }
  if (error instanceof HTTPError) {
    // Response.json (bukan c.json) — status HTTPError bertipe number biasa,
    // sementara c.json meminta ContentfulStatusCode.
    return Response.json({ message: error.message }, { status: error.status });
  }
  return errorResponse(error);
}
