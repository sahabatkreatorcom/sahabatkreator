// MCP server stdio — adapter tipis di atas Public API /v1.
//
// Setiap tool = satu endpoint /v1. Scope tool mengikuti scope token
// (SAHABATKREATOR_API_KEY): token membawa scope apa, tool itu yang bisa dipakai.
// Tool write (POST/PATCH/DELETE) hanya muncul bila token punya scope write-nya.
//
// Tabel tool TIDAK didefinisikan di sini — ia hidup di
// `@sahabatkreator/api/mcp/tools` supaya transport stdio dan transport HTTP
// (apps/server, POST /mcp) tidak pernah berbeda diam-diam. File ini hanya
// mengurus transport: stdio, satu proses per klien, dijalankan di mesin pengguna.
//
// Menjalankan:
//   SAHABATKREATOR_API_KEY=sk_api_... bun run start
//   atau:   bun run start sk_api_...        (arg pertama = token)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  assertToolScope,
  buildToolRequest,
  MCP_TOOLS,
  type McpToolDef,
  toolAnnotations,
  visibleTools,
} from "@sahabatkreator/api/mcp/tools";
import { z } from "zod";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const API_KEY = process.env.SAHABATKREATOR_API_KEY ?? process.argv[2];

if (!API_KEY) {
  console.error(
    "SAHABATKREATOR_API_KEY belum diset (env atau arg pertama). Buat key di Settings → API.",
  );
  process.exit(1);
}

async function callV1(
  tool: McpToolDef,
  args: Record<string, unknown>,
  scopes: string[],
): Promise<unknown> {
  assertToolScope(tool, scopes);

  const { path, body } = buildToolRequest(tool, args);

  const res = await fetch(`${SERVER_URL}${path}`, {
    method: tool.method,
    headers: {
      authorization: `Bearer ${API_KEY}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

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

async function main() {
  // Cek scope token sekali di awal (ping mengembalikan scopes)
  let scopes: string[] = [];
  try {
    const pingTool = MCP_TOOLS.find((t) => t.name === "ping");
    if (!pingTool) throw new Error("tool ping tidak ditemukan di MCP_TOOLS");
    const ping = (await callV1(pingTool, {}, [])) as { key?: { scopes?: string[] } };
    scopes = ping.key?.scopes ?? [];
  } catch (e) {
    console.error("Gagal memverifikasi token:", (e as Error).message);
    process.exit(1);
  }

  const server = new McpServer({
    name: "sahabatkreator",
    version: "1.0.0",
  });

  const tools = visibleTools(scopes);

  for (const tool of tools) {
    const schema = tool.params ? z.object(tool.params) : z.object({}).describe("tanpa parameter");

    server.registerTool(
      tool.name,
      {
        // `title` sengaja ada di dua tempat (level Tool + annotations) — spec
        // MCP memberi presedensi `title` → `annotations.title` → `name`, jadi
        // klien yang hanya membaca salah satunya tetap dapat label yang benar.
        title: tool.title,
        description: tool.description,
        inputSchema: schema.shape,
        annotations: toolAnnotations(tool),
      },
      async (args) => {
        try {
          const result = await callV1(tool, args as Record<string, unknown>, scopes);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[mcp] Sahabat Kreator MCP server berjalan (${tools.length} tool, scope token: ${scopes.join(", ") || "none"})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
