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
// tanpa server, tanpa DB, tanpa jaringan. Anotasi tool karena itu didefinisikan
// ulang di sini alih-alih diimpor dari SDK.
import type { ApiKeyScope } from "@sahabatkreator/db/schema";
import { z } from "zod";

/**
 * Cermin `ToolAnnotations` dari spec MCP (2025-06-18).
 *
 * Klien memakai ini untuk keputusan yang menyangkut pengguna: tool dengan
 * `readOnlyHint: true` boleh dipanggil tanpa konfirmasi, tool destruktif tidak.
 * Direktori Connector Claude juga mensyaratkan field ini ada — tanpa anotasi,
 * tool kita dianggap "perilakunya tidak diketahui" dan gagal review.
 */
export type McpToolAnnotations = {
  /** Judul ramah-manusia; `name` tetap identifier teknis. */
  title: string;
  /** true = tool tidak mengubah state apa pun. */
  readOnlyHint: boolean;
  /** true = tool bisa menghapus/menimpa data (bermakna hanya saat readOnlyHint=false). */
  destructiveHint: boolean;
  /** true = pemanggilan berulang dengan argumen sama memberi hasil sama. */
  idempotentHint: boolean;
  /** true = tool menyentuh entitas di luar batas server (LLM / data web). */
  openWorldHint: boolean;
};

export type McpToolDef = {
  name: string;
  /** Judul ramah-manusia untuk label tool di klien MCP. */
  title: string;
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
  /**
   * Tool menyentuh entitas di luar batas server — panggilan LLM, atau data yang
   * diambil dari web (mis. Google Trends). Dipakai mengisi `openWorldHint`.
   *
   * SENGAJA eksplisit, bukan diturunkan dari scope: `ai:read` (trends) dan
   * `ai:write` (generator) sama-sama menyentuh dunia luar, tapi itu kebetulan —
   * tool `ai:*` berikutnya bisa saja murni membaca DB kita.
   */
  openWorld?: boolean;
};

export const MCP_TOOLS: McpToolDef[] = [
  {
    name: "ping",
    title: "Cek Koneksi & Token",
    description: "Cek koneksi & validitas token Sahabat Kreator.",
    scope: "",
    method: "GET",
    path: "/v1/ping",
  },
  {
    name: "list_accounts",
    title: "Daftar Akun Sosial Media",
    description: "Daftar akun sosial media organisasi (status koneksi).",
    scope: "accounts:read",
    method: "GET",
    path: "/v1/accounts",
  },
  {
    name: "list_posts",
    title: "Daftar Post",
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
    title: "Detail Post",
    description: "Detail satu post group berdasarkan ID.",
    scope: "posts:read",
    method: "GET",
    path: "/v1/posts/{id}",
    params: { id: z.string().describe("Post group ID") },
  },
  {
    name: "analytics_overview",
    title: "Ringkasan Performa",
    description: "Ringkasan performa (followers, engagement) periode terakhir.",
    scope: "analytics:read",
    method: "GET",
    path: "/v1/analytics/overview",
    params: { days: z.number().optional().describe("Jumlah hari (default 30)") },
  },
  {
    name: "analytics_top_posts",
    title: "Post Paling Berperforma",
    description: "Post dengan engagement tertinggi.",
    scope: "analytics:read",
    method: "GET",
    path: "/v1/analytics/top-posts",
    params: { limit: z.number().optional().describe("Jumlah post (default 10)") },
  },
  {
    name: "report_summary",
    title: "Ringkasan Laporan",
    description: "Ringkasan laporan periode (post, engagement, goals).",
    scope: "reports:read",
    method: "GET",
    path: "/v1/reports/summary",
  },
  {
    name: "list_media",
    title: "Daftar Media",
    description: "Daftar media library organisasi.",
    scope: "media:read",
    method: "GET",
    path: "/v1/media",
  },
  {
    name: "render_manifest",
    title: "Daftar Hasil Render",
    description: "Daftar hasil render video yang sudah selesai.",
    scope: "renders:read",
    method: "GET",
    path: "/v1/renders/manifest",
  },
  {
    name: "ai_caption",
    title: "Generate Caption AI",
    description: "Generate caption + hashtag dari prompt (mengonsumsi kredit AI).",
    scope: "ai:write",
    method: "POST",
    path: "/v1/ai/caption",
    mode: "body",
    openWorld: true,
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
    title: "Generate Hashtag AI",
    description: "Generate hashtag dari prompt (mengonsumsi kredit AI).",
    scope: "ai:write",
    method: "POST",
    path: "/v1/ai/hashtag",
    mode: "body",
    openWorld: true,
    params: {
      prompt: z.string().min(3).describe("Topik konten"),
      platform: z.string().describe("Platform target"),
      count: z.number().optional().describe("Jumlah hashtag (default 10)"),
    },
  },
  {
    name: "trends",
    title: "Tren Google Indonesia",
    description: "Tren harian Google Indonesia.",
    scope: "ai:read",
    method: "GET",
    path: "/v1/trends",
    openWorld: true,
    params: { limit: z.number().optional().describe("Jumlah tren (default 20)") },
  },
  {
    name: "list_automation",
    title: "Daftar Automation",
    description: "Daftar aturan automation organisasi.",
    scope: "automation:read",
    method: "GET",
    path: "/v1/automation",
  },
  {
    name: "webhook_deliveries",
    title: "Riwayat Pengiriman Webhook",
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
 * Turunkan anotasi MCP dari perilaku tool.
 *
 * Sumber kebenaran tetap `scope` + `method` — bukan field anotasi terpisah —
 * supaya tidak ada dua tempat yang bisa berbeda diam-diam: begitu scope sebuah
 * tool diubah, `readOnlyHint`-nya ikut berubah tanpa ada yang perlu diingat.
 * `title` dan `openWorld` tidak bisa diturunkan, jadi keduanya tetap authored.
 *
 * Aturan:
 *   - readOnlyHint: scope `:read` (atau tanpa scope) tidak pernah menulis.
 *   - destructiveHint: hanya method yang bisa menghapus/menimpa. Katalog saat
 *     ini tidak punya keduanya (satu-satunya tool tulis adalah generator AI),
 *     tapi aturannya ditulis umum supaya tool DELETE/PATCH berikutnya tidak
 *     diam-diam ditandai "aman".
 *   - idempotentHint: mengikuti readOnlyHint. Tool baca deterministik; tool
 *     tulis AI bisa memberi teks berbeda di panggilan kedua — dan menagih
 *     kredit lagi.
 *   - openWorldHint: dari `tool.openWorld` (LLM / sumber data web).
 */
export function toolAnnotations(tool: McpToolDef): McpToolAnnotations {
  const readOnly = tool.scope === "" || tool.scope.endsWith(":read");
  return {
    title: tool.title,
    readOnlyHint: readOnly,
    destructiveHint: !readOnly && (tool.method === "DELETE" || tool.method === "PATCH"),
    idempotentHint: readOnly,
    openWorldHint: tool.openWorld ?? false,
  };
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
