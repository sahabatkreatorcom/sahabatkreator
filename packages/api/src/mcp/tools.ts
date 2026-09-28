// Tabel tool MCP — satu sumber kebenaran untuk SEMUA transport MCP.
//
// MENGAPA modul ini ada di packages/api: setiap tool MCP hanyalah proyeksi dari
// satu endpoint Public API `/v1` (RFC §7: "tidak ada logika bisnis di MCP").
// Dua transport mengonsumsi daftar yang sama:
//   - apps/mcp    → stdio, dijalankan di mesin pengguna (Claude Desktop, Cursor)
//   - apps/server → POST /mcp, Streamable HTTP, di-host kita (pelanggan tanpa instalasi)
// Kalau tabelnya digandakan, kedua transport akan berbeda diam-diam dari
// allowlist `/v1` — dan itu kelas bug yang tidak akan ketahuan sampai ada
// pelanggan yang tool-nya "tidak muncul" atau "404".
//
// Modul ini SENGAJA tidak mengimpor @modelcontextprotocol/sdk: isinya hanya
// data + pemetaan murni, sehingga bisa dipakai transport apa pun dan diuji
// tanpa server, tanpa DB, tanpa jaringan.
import type { ApiKeyScope } from "@sahabatkreator/db/schema";
import { z } from "zod";

export type McpToolDef = {
  name: string;
  description: string;
  /**
   * Scope API key yang diperlukan. String kosong = selalu tersedia (mis. `ping`).
   * Nilai ini dipakai dua kali: menyembunyikan tool dari klien, dan gagal cepat
   * sebelum request dikirim (server tetap memverifikasi ulang via requireScope).
   */
  scope: ApiKeyScope | "";
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Path Public API `/v1`. Segmen dinamis ditulis `{nama}`. */
  path: string;
  params?: Record<string, z.ZodType>;
  /**
   * Bagaimana argumen dipetakan: `query` (GET) atau `body` (POST/PATCH).
   * Default: query untuk GET, body untuk method lain.
   */
  mode?: "query" | "body";
};

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "ping",
    description: "Cek koneksi & validitas token Sahabat Kreator.",
    scope: "",
    method: "GET",
    path: "/v1/ping",
  },
  {
    name: "list_accounts",
    description: "Daftar akun sosial media organisasi (status koneksi).",
    scope: "accounts:read",
    method: "GET",
    path: "/v1/accounts",
  },
  {
    name: "list_posts",
    description: "Daftar post (draft, terjadwal, sudah tayang).",
    scope: "posts:read",
    method: "GET",
    path: "/v1/posts",
    params: {
      status: z.string().optional().describe("Filter status: draft|scheduled|published|failed"),
      page: z.number().optional().describe("Halaman (default 1)"),
      perPage: z.number().optional().describe("Item per halaman (default 50, max 100)"),
    },
  },
  {
    name: "get_post",
    description: "Detail satu post group berdasarkan ID.",
    scope: "posts:read",
    method: "GET",
    path: "/v1/posts/{id}",
    params: { id: z.string().describe("Post group ID") },
  },
  {
    name: "analytics_overview",
    description: "Ringkasan performa (followers, engagement) periode terakhir.",
    scope: "analytics:read",
    method: "GET",
    path: "/v1/analytics/overview",
    params: { days: z.number().optional().describe("Jumlah hari (default 30)") },
  },
  {
    name: "analytics_top_posts",
    description: "Post dengan engagement tertinggi.",
    scope: "analytics:read",
    method: "GET",
    path: "/v1/analytics/top-posts",
    params: { limit: z.number().optional().describe("Jumlah post (default 10)") },
  },
  {
    name: "report_summary",
    description: "Ringkasan laporan periode (post, engagement, goals).",
    scope: "reports:read",
    method: "GET",
    path: "/v1/reports/summary",
  },
  {
    name: "list_media",
    description: "Daftar media library organisasi.",
    scope: "media:read",
    method: "GET",
    path: "/v1/media",
  },
  {
    name: "render_manifest",
    description: "Daftar hasil render video yang sudah selesai.",
    scope: "renders:read",
    method: "GET",
    path: "/v1/renders/manifest",
  },
  {
    name: "ai_caption",
    description: "Generate caption + hashtag dari prompt (mengonsumsi kredit AI).",
    scope: "ai:write",
    method: "POST",
    path: "/v1/ai/caption",
    mode: "body",
    params: {
      prompt: z.string().min(3).describe("Topik/deskripsi konten"),
      platform: z
        .enum([
          "instagram",
          "facebook",
          "tiktok",
          "youtube",
          "linkedin",
          "pinterest",
          "threads",
          "x",
        ])
        .describe("Platform target"),
      tone: z
        .enum(["santai", "profesional", "lucu", "inspiratif", "promosi"])
        .optional()
        .describe("Gaya bahasa (default santai)"),
    },
  },
  {
    name: "ai_hashtag",
    description: "Generate hashtag dari prompt (mengonsumsi kredit AI).",
    scope: "ai:write",
    method: "POST",
    path: "/v1/ai/hashtag",
    mode: "body",
    params: {
      prompt: z.string().min(3).describe("Topik konten"),
      platform: z.string().describe("Platform target"),
      count: z.number().optional().describe("Jumlah hashtag (default 10)"),
    },
  },
  {
    name: "trends",
    description: "Tren harian Google Indonesia.",
    scope: "ai:read",
    method: "GET",
    path: "/v1/trends",
    params: { limit: z.number().optional().describe("Jumlah tren (default 20)") },
  },
  {
    name: "list_automation",
    description: "Daftar aturan automation organisasi.",
    scope: "automation:read",
    method: "GET",
    path: "/v1/automation",
  },
  {
    name: "webhook_deliveries",
    description: "Audit pengiriman webhook keluar organisasi.",
    scope: "webhooks:read",
    method: "GET",
    path: "/v1/webhooks/deliveries",
  },
];

/**
 * Tool yang boleh dilihat token ini. Prinsipnya: **tool MCP mengikuti scope
 * token**, bukan sebaliknya — token read-only tidak pernah melihat tool tulis.
 */
export function visibleTools(scopes: readonly string[]): McpToolDef[] {
  return MCP_TOOLS.filter((tool) => !tool.scope || scopes.includes(tool.scope));
}

/**
 * Gagal cepat bila token tidak punya scope tool ini. Server tetap memverifikasi
 * ulang (requireScope di /v1) — ini hanya menghemat satu round-trip dan
 * menghasilkan pesan yang bisa ditindaklanjuti pengguna.
 */
export function assertToolScope(tool: McpToolDef, scopes: readonly string[]): void {
  if (tool.scope && !scopes.includes(tool.scope)) {
    throw new Error(
      `Token tidak punya scope "${tool.scope}" — buat key dengan scope tersebut di Settings → API.`,
    );
  }
}

export type ToolRequest = {
  /** Path relatif siap dikirim, termasuk query string bila ada. */
  path: string;
  /** Body JSON — hanya ada untuk method yang mengirim body (bukan GET/DELETE). */
  body?: Record<string, unknown>;
};

/**
 * Petakan argumen tool → request Public API.
 *
 * Tiga aturan:
 *   1. Argumen yang namanya cocok dengan segmen `{nama}` di path menjadi bagian
 *      path, dan TIDAK boleh ikut lagi ke query/body.
 *   2. GET menaruh sisanya di query string.
 *   3. Method lain menaruh sisanya di body JSON — kecuali DELETE, yang di API ini
 *      tidak menerima body.
 *
 * `undefined` selalu dibuang (klien MCP sering mengirim optional param sebagai
 * undefined; mengirimnya akan jadi `status=undefined` di query).
 */
export function buildToolRequest(
  tool: McpToolDef,
  args: Record<string, unknown> = {},
): ToolRequest {
  let path = tool.path;
  const query: string[] = [];
  // Dilacak terpisah karena setelah substitusi `path` sudah tidak memuat
  // `{id}` lagi, sehingga pengecekan ulang "apakah ini path param" mustahil.
  const pathParams = new Set<string>();
  const useBody = tool.mode === "body" || tool.method !== "GET";

  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) continue;
    if (path.includes(`{${key}}`)) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
      pathParams.add(key);
    } else if (!useBody) {
      query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  if (query.length) path += `?${query.join("&")}`;

  const isBody = useBody && tool.method !== "DELETE";
  const body = isBody
    ? Object.fromEntries(
        Object.entries(args).filter(([key, value]) => !pathParams.has(key) && value !== undefined),
      )
    : undefined;

  return body ? { path, body } : { path };
}
