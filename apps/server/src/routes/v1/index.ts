// Router Public API v1 — dipasang di root sebagai /v1.
//
// Middleware urut (wajib sebelum route apa pun):
//   verifyApiKeyMiddleware → publicApiRateLimit → publicApiPlanGate
// Route bermodule menambahkan requireScope("<resource>:<r/w>") sesuai kebutuhan.
//
// Handler memakai guard yang SAMA dengan /api (requireOrg dkk.) karena
// getAuthContext() mengembalikan konteks API key bila c.set("apiKeyAuth")
// sudah diisi — tidak ada logika duplikat.

import { publicApiDocument } from "@sahabatkreator/api";
import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { requireOrg } from "../../lib/auth-guard";
import {
  publicApiPlanGate,
  publicApiRateLimit,
  verifyApiKeyMiddleware,
} from "../../lib/public-api";
import { accountsRoute } from "../accounts";
import { aiRoute } from "../ai";
import { analyticsRoute } from "../analytics";
import { autoClipRoute } from "../auto-clip";
import { automationRoute } from "../automation";
import { carouselRoute } from "../carousel";
import { mediaRoute } from "../media";
import { postsRoute } from "../posts";
import { rendersRoute } from "../renders";
import { reportRoute } from "../report";
import { trendsRoute } from "../trends";
import { videoRoute } from "../video";
import { mountRoutes } from "./mount";
import { webhookDeliveryRoute } from "./webhooks";

export const v1Route = new Hono();

// Dokumentasi /v1 harus terbuka tanpa key (path spesifik menang vs use("*")
// di Hono), jadi dipasang SEBELUM middleware auth di bawah. Dipasang di sini
// (bukan app root) supaya semua layanan /v1 terkumpul di satu tempat.
v1Route.get("/openapi.json", (c) => c.json(publicApiDocument));
v1Route.get("/docs", apiReference({ spec: { url: "/v1/openapi.json" } }));

v1Route.use("*", verifyApiKeyMiddleware);
v1Route.use("*", publicApiRateLimit);
v1Route.use("*", publicApiPlanGate);

/**
 * GET /v1/ping — verifikasi koneksi + token. Sengaja TANPA requireScope:
 * satu-satunya tujuannya membuktikan key valid dan plan layak memakai /v1.
 */
v1Route.get("/ping", async (c) => {
  const ctx = await requireOrg(c);
  const key = c.get("apiKey");
  return c.json({
    ok: true,
    organization: {
      id: ctx.organization.id,
      name: ctx.organization.name,
      slug: ctx.organization.slug,
    },
    key: {
      id: key.id,
      name: key.name,
      prefix: key.tokenPrefix,
      scopes: key.scopes,
    },
    serverTime: new Date().toISOString(),
  });
});

// Allowlist tertutup — hanya (metode, path, scope) yang terdaftar di bawah
// yang terpasang di /v1. Router asli tetap satu-satunya sumber implementasi,
// jadi tidak ada query yang diduplikasi. Method tulis tanpa entri di sini tidak
// pernah punya jalur, dan plan gate tetap menahan method tulis di luar
// Business/Enterprise (api_write) sebelum sampai ke scope check.
//
// Fase 1 — Read
mountRoutes(v1Route, "/accounts", accountsRoute, [
  { method: "GET", path: "/", scope: "accounts:read" },
  { method: "GET", path: "/:id/statistic", scope: "accounts:read" },
  // Connect akun lewat API (RFC rfc-oauth-connect.md). GET, tapi scope-nya
  // `accounts:write` dan handler-nya menegakkan `api_write` secara manual —
  // lihat catatan di routes/accounts.ts (publicApiPlanGate melewatkan gate tulis
  // untuk method safe).
  { method: "GET", path: "/:platform/authorize", scope: "accounts:write" },
  // Fase 3 — tukar `code` jadi akun. `connect` & `exchange` sama-sama POST, jadi
  // gate `api_write` otomatis dari publicApiPlanGate.
  { method: "POST", path: "/:platform/connect", scope: "accounts:write" },
  { method: "POST", path: "/:platform/exchange", scope: "accounts:write" },
  // Picker aset: GET-nya juga butuh gate tulis manual (lihat accounts.ts).
  { method: "GET", path: "/pending/:id", scope: "accounts:write" },
  { method: "POST", path: "/pending/:id/select", scope: "accounts:write" },
]);
mountRoutes(v1Route, "/posts", postsRoute, [
  { method: "GET", path: "/", scope: "posts:read" },
  { method: "GET", path: "/:id", scope: "posts:read" },
  { method: "POST", path: "/", scope: "posts:write" },
  { method: "POST", path: "/:id/publish", scope: "posts:write" },
  { method: "POST", path: "/:id/retry", scope: "posts:write" },
  { method: "DELETE", path: "/:id", scope: "posts:write" },
]);
mountRoutes(v1Route, "/analytics", analyticsRoute, [
  { method: "GET", path: "/overview", scope: "analytics:read" },
  { method: "GET", path: "/timeseries", scope: "analytics:read" },
  { method: "GET", path: "/top-posts", scope: "analytics:read" },
]);
mountRoutes(v1Route, "/reports", reportRoute, [
  { method: "GET", path: "/summary", scope: "reports:read" },
]);
mountRoutes(v1Route, "/media", mediaRoute, [
  { method: "GET", path: "/", scope: "media:read" },
  { method: "POST", path: "/import", scope: "media:write" },
]);
mountRoutes(v1Route, "/renders", rendersRoute, [
  { method: "GET", path: "/manifest", scope: "renders:read" },
]);

// Fase 2 — Automation (GET read, sisanya write)
mountRoutes(v1Route, "/automation", automationRoute, [
  { method: "GET", path: "/", scope: "automation:read" },
  { method: "POST", path: "/", scope: "automation:write" },
  { method: "PATCH", path: "/:id", scope: "automation:write" },
  { method: "DELETE", path: "/:id", scope: "automation:write" },
]);

// Fase 4 — Webhook keluar: delivery log (read-only). Konfigurasi endpoint
// tetap via session UI (/api/webhook-endpoints) seperti api-keys.
mountRoutes(v1Route, "/webhooks", webhookDeliveryRoute, [
  { method: "GET", path: "/deliveries", scope: "webhooks:read" },
  { method: "GET", path: "/events", scope: "webhooks:read" },
]);

// Fase 3 — Render async + AI.
// Poll (GET /:id) sengaja pakai renders:write: polling adalah bagian dari alur
// tulis (buat job → poll status) dan skop tulis tidak pernah dimiliki key
// read-only, jadi tidak ada konfigurasi key yang jadi putus karenanya.
mountRoutes(v1Route, "/carousel", carouselRoute, [
  { method: "POST", path: "/", scope: "renders:write" },
  { method: "GET", path: "/:id", scope: "renders:write" },
]);
mountRoutes(v1Route, "/video", videoRoute, [
  { method: "POST", path: "/", scope: "renders:write" },
  { method: "GET", path: "/:id", scope: "renders:write" },
]);
mountRoutes(v1Route, "/auto-clip", autoClipRoute, [
  { method: "POST", path: "/", scope: "renders:write" },
  { method: "GET", path: "/:id", scope: "renders:write" },
  { method: "POST", path: "/:id/select", scope: "renders:write" },
]);

// aiRateLimit (route.use("/*", aiRateLimit)) ikut tersalin otomatis sebagai
// middleware modul — rate limit AI berlaku sama di /v1.
mountRoutes(v1Route, "/ai", aiRoute, [
  { method: "POST", path: "/caption", scope: "ai:write" },
  { method: "POST", path: "/hashtag", scope: "ai:write" },
  { method: "POST", path: "/rewrite", scope: "ai:write" },
  { method: "POST", path: "/repurpose", scope: "ai:write" },
  { method: "GET", path: "/usage", scope: "ai:read" },
]);

// GET /trends tidak mengonsumsi kredit AI (hanya fetch tren eksternal), jadi
// cukup ai:read — kredit hanya dipakai POST /trends/ideas.
mountRoutes(v1Route, "/trends", trendsRoute, [
  { method: "GET", path: "/", scope: "ai:read" },
  { method: "POST", path: "/ideas", scope: "ai:write" },
]);

// 404 JSON — memakai catch-all (bukan notFound) karena app.route() menyalin
// route ke parent, sementara handler notFound tidak ikut tersalin.
// Dibalik middleware auth: request tanpa key yang salah path tetap mendapat
// 401, bukan 404 — jangan bocorkan keberadaan endpoint.
v1Route.all("/*", (c) => c.json({ message: "Endpoint tidak ditemukan" }, 404));
