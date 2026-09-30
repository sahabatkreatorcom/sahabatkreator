// Helper untuk menulis path OpenAPI /v1 secara ringkas dan konsisten.
//
// Ref schema ditulis sebagai string literal ("#/components/schemas/...") karena
// nama schema dideklarasikan eksplisit lewat .openapi("Name") di file skema.
// Generator mengumpulkan schema tersebut dari registry zod-to-openapi.
import type { OpenAPIPaths } from "./types";

type Ref = { $ref: string };

const ERROR_REF: Ref = { $ref: "#/components/schemas/ErrorResponse" };

export type PathOp = {
  summary: string;
  description?: string;
  tags: string[];
  scopes: string[];
  parameters?: unknown[];
  requestBody?: Ref;
  responses: Record<string, unknown>;
};

export function errorResponses(
  extra: Record<
    string,
    { description: string; content: { "application/json": { schema: Ref } } }
  > = {},
) {
  const base: Record<
    string,
    { description: string; content: { "application/json": { schema: Ref } } }
  > = {
    "400": {
      description: "Permintaan tidak valid (validasi schema / input salah).",
      content: { "application/json": { schema: ERROR_REF } },
    },
    "401": {
      description: "API key tidak ada, tidak valid, atau sudah dicabut.",
      content: { "application/json": { schema: ERROR_REF } },
    },
    "402": {
      description: "Plan tidak termasuk api_access (atau api_write untuk endpoint tulis).",
      content: { "application/json": { schema: ERROR_REF } },
    },
    "403": {
      description: "Key tidak memiliki scope yang dibutuhkan endpoint ini.",
      content: { "application/json": { schema: ERROR_REF } },
    },
    "404": {
      description: "Endpoint tidak ditemukan, atau sumber daya tidak ada.",
      content: { "application/json": { schema: ERROR_REF } },
    },
    "429": {
      description: "Terlalu banyak permintaan (60/menit per key).",
      content: { "application/json": { schema: ERROR_REF } },
    },
  };
  return { ...base, ...extra };
}

export function jsonContent(schema: Ref) {
  return { "application/json": { schema } };
}

export function pathParam(name: string, description?: string, schema: object = { type: "string" }) {
  return { name, in: "path" as const, required: true, schema, description };
}

export function queryParam(name: string, schema: object, description?: string) {
  return { name, in: "query" as const, required: false, schema, description };
}

export function op(cfg: PathOp) {
  return {
    summary: cfg.summary,
    description: cfg.description ?? "",
    tags: cfg.tags,
    "x-required-scopes": cfg.scopes,
    security: [{ apiKeyAuth: [] }],
    parameters: cfg.parameters ?? [],
    requestBody: cfg.requestBody
      ? { required: true, content: jsonContent(cfg.requestBody) }
      : undefined,
    responses: cfg.responses,
  };
}

/**
 * operationId deterministik dari method + path untuk semua operasi yang belum
 * punya operationId eksplisit. Format = `${method}_${path}` dengan `/` dan `{`
 * diganti `_` — identik dengan id fallback yang dipakai parser
 * vitepress-openapi-docs, supaya halaman docs yang sudah ada tetap resolve.
 *
 * Contoh: `GET /v1/posts/{id}/publish` → `get_v1_posts_id_publish`.
 * Stabil lintas regenerasi; dipakai docs site sebagai `<OpenApiEndpoint id>`.
 */
export function withOperationIds<T extends Record<string, Record<string, unknown>>>(paths: T): T {
  for (const [path, ops] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(ops)) {
      if (!operation || typeof operation !== "object") continue;
      const record = operation as Record<string, unknown>;
      if (record.operationId) continue;
      const slug = path.replace(/^\//, "").replace(/[{}]/g, "").replace(/[/-]/g, "_");
      record.operationId = `${method}_${slug}`;
    }
  }
  return paths;
}

export type Paths = OpenAPIPaths;
