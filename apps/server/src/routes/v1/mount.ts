// Mount route eksisting ke /v1 dengan allowlist eksplisit (metode + path + scope).
//
// Kenapa menyalin route (bukan app.route() ke router asli):
//   router asli dipakai juga oleh /api — memasangnya ulang di /v1 akan
//   membuka SEMUA endpoint miliknya, padahal contract Public API adalah
//   allowlist tertutup. Dengan menyalin hanya entri yang terdaftar, tidak ada
//   endpoint yang bocor diam-diam ke /v1.
//
// Dua aturan salin:
//   1. Middleware modul (entri method "ALL" dari source.use(...) — Hono
//      mendaftar use() dengan METHOD_NAME_ALL = "ALL", bukan "*" — mis.nya
//      gateFeature("automation") atau aiRateLimit) IKUT disalin — tanpa ini
//      gate paket yang melindungi modul itu tidak berlaku di /v1.
//   2. Handler hanya disalin bila masuk allowlist. Method tulis yang tidak
//      terdaftar tidak pernah punya jalur di /v1.
//
// Scope dipasang PER ROUTE (bukan use("*") per prefix) karena satu prefix bisa
// membawa scope berbeda — GET /automation butuh automation:read sementara
// POST /automation butuh automation:write.
import type { ApiKeyScope } from "@sahabatkreator/db/schema";
import { Hono } from "hono";
import { requireScope } from "../../lib/public-api";

export type MountSpec = {
  method: string;
  path: string;
  scope: ApiKeyScope;
};

export function mountRoutes(parent: Hono, prefix: string, source: Hono, specs: MountSpec[]): void {
  const child = new Hono();

  for (const route of source.routes) {
    // Hono 4.x mendaftar middleware use() dengan method "ALL" (METHOD_NAME_ALL).
    // Cek keduanya supaya tetap kompatibel bila Hono mengubah representasinya.
    if (route.method === "ALL" || route.method === "*") {
      child.on(route.method, route.path, route.handler);
    }
  }

  const wanted = specs.map((spec) => `${spec.method} ${spec.path}`);
  const matched = new Set<string>();

  // Middleware scope didaftarkan SEBELUM handler pada (method, path) yang sama
  // supaya urutannya: scope check → handler.
  for (const spec of specs) {
    child.on(spec.method, spec.path, requireScope(spec.scope));
  }

  for (const route of source.routes) {
    const key = `${route.method} ${route.path}`;
    if (wanted.includes(key)) {
      child.on(route.method, route.path, route.handler);
      matched.add(key);
    }
  }

  const missing = wanted.filter((key) => !matched.has(key));
  if (missing.length > 0) {
    throw new Error(`[v1] allowlist tidak cocok untuk "${prefix}": ${missing.join(", ")}`);
  }

  parent.route(prefix, child);
}
