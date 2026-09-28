// MCP remote — Streamable HTTP di atas Public API /v1.
//
// MENGAPA endpoint ini ada padahal sudah ada `apps/mcp` (stdio): transport stdio
// mengharuskan klien MCP menjalankan proses lokal — butuh Bun terpasang, repo
// di-clone, dan path absolut ke `apps/mcp/src/index.ts`. Itu wajar untuk pemilik
// repo, tapi tidak mungkin dibebankan ke pelanggan. Endpoint ini membuat agen AI
// (Claude Code, Cursor, ChatGPT/Responses API) bisa memakai Sahabat Kreator
// tanpa instalasi apa pun: cukup URL + API key.
//
// Prinsipnya sama dengan /v1 — TIDAK ADA logika bisnis di sini. Setiap tool
// dipetakan ke satu endpoint /v1 lalu dijalankan sebagai subrequest internal ke
// app yang sama (bukan hop jaringan, bukan handler kedua), sehingga auth, gate
// plan, scope, rate limit, konsumsi kredit AI, dan audit log berperilaku
// identik dengan pemakaian HTTP biasa. Satu sumber kebenaran tetap handler /api.
//
// STATELESS — sengaja. Tool di sini murni proxy tanpa state percakapan, jadi
// tidak ada sesi yang perlu disimpan: tidak butuh session store Redis, tidak
// butuh sticky session di belakang NGINX, dan container bisa di-scale bebas.
// Konsekuensinya server→client request (sampling/elicitation) dan resumability
// SSE tidak tersedia — memang tidak dipakai.
//
// KENAPA JSON, BUKAN SSE: NGINX `proxy_buffering` (default on) menyangga respons
// streaming, jadi transport SSE menuntut `proxy_buffering off` di lokasi /mcp.
// Karena semua tool di sini request/response sederhana, `enableJsonResponse`
// menghapus kebutuhan konfigurasi NGINX itu tanpa kehilangan apa pun.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildToolRequest, type McpToolDef, visibleTools } from "@sahabatkreator/api/mcp/tools";
import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { extractApiKey } from "../lib/api-key";
import { publicApiAccessGate, verifyApiKeyMiddleware } from "../lib/public-api";
import { rateLimitMiddleware } from "../lib/rate-limit";

declare module "hono" {
  interface ContextVariableMap {
    /** Body JSON-RPC yang sudah diparse — dipakai ulang oleh transport MCP. */
    mcpParsedBody?: unknown;
    /** Method JSON-RPC ("tools/call", "initialize", …) — penentu rate limit. */
    mcpJsonRpcMethod?: string;
  }
}

/**
 * Dispatcher subrequest internal. Diisi index.ts setelah semua route terpasang
 * (`app.fetch`) — pola registrasi yang sama dengan `registerWebhookEmit` di
 * packages/publishing, dipakai supaya modul ini tidak mengimpor index.ts
 * (yang akan jadi siklus impor).
 *
 * Return-nya sengaja `Response | Promise<Response>`: `Hono.fetch()` bertipe
 * union, dan membungkusnya dengan Promise.resolve hanya menambah lapisan tanpa
 * manfaat.
 */
export type McpDispatch = (request: Request) => Response | Promise<Response>;

let dispatch: McpDispatch | null = null;

export function registerMcpDispatch(fn: McpDispatch): void {
  dispatch = fn;
}

const TOOL_CALL_METHOD = "tools/call";

/** Bentuk error JSON-RPC 2.0 — bukan `{message}`, karena klien MCP mem-parse protokol. */
function jsonRpcError(code: number, message: string) {
  return { jsonrpc: "2.0" as const, error: { code, message }, id: null };
}

/**
 * Parse body JSON-RPC lebih awal karena dua alasan:
 *   1. Rate limit envelope perlu tahu method-nya (lihat mcpEnvelopeRateLimit).
 *   2. Transport MCP bisa menerima body yang sudah diparse, sehingga body tidak
 *      dibaca dua kali dari stream request.
 */
const parseJsonRpcBody: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "POST") {
    await next();
    return;
  }

  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    return c.json(jsonRpcError(-32700, "Parse error: body bukan JSON yang valid"), 400);
  }

  c.set("mcpParsedBody", parsed);

  // Batch (array) tidak dipakai klien MCP mana pun saat ini; kalau toh datang,
  // method-nya tidak terbaca → request dihitung limiter (aman, lebih ketat).
  const method = Array.isArray(parsed) ? undefined : (parsed as { method?: unknown })?.method;
  if (typeof method === "string") c.set("mcpJsonRpcMethod", method);

  await next();
};

/**
 * Rate limit envelope `/mcp`.
 *
 * HANYA request yang BUKAN `tools/call` yang dihitung: initialize, tools/list,
 * notifications/*, ping. Alasannya `tools/call` sengaja dilewatkan — setiap
 * pemanggilan tool sudah menagih kuota `/v1` lewat subrequest internal (satu
 * tool call = satu request /v1, lihat `publicApiRateLimit`). Menghitungnya di
 * sini juga akan menagih kuota dua kali untuk satu pekerjaan dan membuat batas
 * efektif jadi separuh dari yang dijanjikan dokumentasi.
 *
 * Jadi: 120/menit untuk permukaan handshake (yang tidak menyentuh /v1 sama
 * sekali), dan 60/menit untuk pekerjaan nyata — warisan kuota /v1 per key.
 */
const mcpEnvelopeRateLimit = rateLimitMiddleware({
  windowMs: 60_000,
  max: 120,
  prefix: "mcp",
  identity: (c) => {
    const key = c.get("apiKey");
    return key ? `key:${key.id}` : undefined;
  },
  skip: (c) => c.get("mcpJsonRpcMethod") === TOOL_CALL_METHOD,
  // Bentuk JSON-RPC, bukan {message}: klien MCP mem-parse protokol dan akan
  // melaporkan "invalid response" bila menerima bentuk REST biasa.
  onLimited: (c, retryAfterSec) =>
    c.json(
      jsonRpcError(-32000, `Rate limit terlampaui. Coba lagi dalam ${retryAfterSec} detik.`),
      429,
    ),
});

/** Jalankan satu tool lewat subrequest internal ke `/v1`. */
async function callTool(
  c: Context,
  tool: McpToolDef,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!dispatch) {
    throw new Error("MCP dispatcher belum terdaftar — panggil registerMcpDispatch saat boot");
  }

  const { path, body } = buildToolRequest(tool, args);

  const credential = extractApiKey(c.req.raw.headers);
  if (!credential) throw new Error("Kredensial API key hilang dari request");

  // Subrequest ke app yang sama — bukan ke jaringan. Konsekuensi yang disengaja:
  // /v1 memverifikasi ULANG token ini, jadi pencabutan key tetap berlaku
  // seketika (tidak ada cache verifikasi yang bisa basi) dan seluruh middleware
  // /v1 (scope, gate api_write, kuota) ikut jalan apa adanya.
  const res = await dispatch(
    new Request(new URL(path, new URL(c.req.url).origin).toString(), {
      method: tool.method,
      headers: {
        authorization: `Bearer ${credential}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${tool.method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const message = (json as { message?: string }).message;
    throw new Error(`${tool.method} ${path} → ${res.status}: ${message ?? text.slice(0, 200)}`);
  }
  return json;
}

/**
 * Layani satu request MCP (handshake maupun pemanggilan tool).
 *
 * Server & transport dibuat PER REQUEST. Di mode stateless tidak ada state yang
 * perlu dibagi antar request, dan ini menghindari penumpukan objek sesi yang
 * tidak pernah ditutup klien.
 */
async function handleMcp(c: Context): Promise<Response> {
  const scopes = c.get("apiKey")?.scopes ?? [];

  const server = new McpServer({ name: "sahabatkreator", version: "1.0.0" });

  for (const tool of visibleTools(scopes)) {
    const schema = tool.params ? z.object(tool.params) : z.object({}).describe("tanpa parameter");

    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: schema.shape },
      async (args) => {
        try {
          const result = await callTool(c, tool, args as Record<string, unknown>);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (e) {
          return {
            content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
            isError: true,
          };
        }
      },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    // undefined = stateless (lihat catatan di header file).
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw, { parsedBody: c.get("mcpParsedBody") });
}

export const mcpRoute = new Hono();

// Dua bentuk path: `/mcp` dan `/mcp/`. Hono strict soal trailing slash, dan URL
// ini ditulis manual oleh pengguna di config klien MCP — keduanya harus hidup.
for (const path of ["/mcp", "/mcp/"]) {
  mcpRoute.use(path, verifyApiKeyMiddleware);
  mcpRoute.use(path, parseJsonRpcBody);
  mcpRoute.use(path, mcpEnvelopeRateLimit);
  // Hanya api_access; gate api_write dipasang oleh subrequest /v1 sesuai method
  // asli tool (lihat publicApiAccessGate).
  mcpRoute.use(path, publicApiAccessGate);
  mcpRoute.post(path, handleMcp);

  // GET & DELETE sengaja TIDAK diteruskan ke transport.
  //
  // GET di spec MCP dipakai klien untuk membuka stream SSE pesan server→klien.
  // Transport SDK bersedia melayaninya (status 200 + stream terbuka), tapi kita
  // tidak pernah mengirim pesan server→klien: tidak ada sampling, tidak ada
  // elicitation, tidak ada progress notification (semua tool request/response).
  // Stream yang menggantung hanya menahan koneksi — dan NGINX yang menyangga
  // respons akan menahannya sampai timeout. Spec MCP mengizinkan server menolak
  // dengan 405, jadi itu yang kita lakukan.
  mcpRoute.on(["GET", "DELETE"], path, (c) => {
    c.header("Allow", "POST");
    return c.json(
      jsonRpcError(-32000, "Metode tidak didukung. Endpoint MCP ini stateless — gunakan POST."),
      405,
    );
  });
}
