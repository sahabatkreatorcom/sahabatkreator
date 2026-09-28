// Test endpoint MCP remote (/mcp) — Streamable HTTP.
//
// Yang dijaga di sini adalah KONTRAK yang tidak kelihatan dari tipe:
//   - token wajib (401) sebelum apa pun diproses;
//   - tool yang muncul mengikuti scope token, bukan mengikuti tabel;
//   - setiap tools/call benar-benar berangkat ke /v1 dengan method & path asli,
//     membawa kredensial pemanggil (bukan kredensial server);
//   - kuota /v1 yang menanggung tools/call, sedangkan limiter envelope hanya
//     menghitung permukaan handshake — salah di sini bikin kuota pelanggan
//     terpotong separuh tanpa alasan.
//
// verifyApiKey & checkPlanFeature di-spy (keduanya menyentuh DB). Pola spy pada
// namespace modul dipakai karena `vi.mock` dengan specifier relatif tidak
// ter-apply di setup vitest repo ini (lihat catatan di MEMORY.md).
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as apiKeyModule from "../lib/api-key";
import * as billingModule from "../lib/billing";
import { closeRateLimitStore } from "../lib/rate-limit";
import { mcpRoute, registerMcpDispatch } from "./mcp";

const TOKEN = "sk_live_testtoken0123456789";
const OTHER_TOKEN = "sk_live_othertoken012345678";

type VerifyResult = NonNullable<Awaited<ReturnType<typeof apiKeyModule.verifyApiKey>>>;

function makeAuth(keyId: string, scopes: string[]): VerifyResult {
  return {
    context: {
      user: {
        id: "u_1",
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        image: null,
        role: null,
        banned: false,
        lastActiveOrganizationId: "org_1",
      },
      sessionId: `apikey_${keyId}`,
      organization: { id: "org_1", name: "Org Test", slug: "org-test", logo: null, role: "owner" },
    },
    key: {
      id: keyId,
      name: "Test Key",
      tokenPrefix: "sk_live_test",
      organizationId: "org_1",
      scopes,
    },
  };
}

/** Request yang tercatat di dispatcher internal (yaitu panggilan ke /v1). */
type DispatchedRequest = {
  method: string;
  path: string;
  authorization: string | null;
};

let scopes: string[];
let keyId: string;
let verifyCalls: (string | null)[];
let dispatched: DispatchedRequest[];

const app = new Hono();
app.route("/", mcpRoute);

async function post(body: unknown, token = TOKEN): Promise<Response> {
  return app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function rpc(method: string, params?: unknown, id = 1): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method, params };
}

const INIT = rpc("initialize", {
  protocolVersion: LATEST_PROTOCOL_VERSION,
  capabilities: {},
  clientInfo: { name: "test-client", version: "1.0.0" },
});

beforeEach(async () => {
  vi.restoreAllMocks();
  // Store rate limit adalah singleton modul — tanpa reset, kuota test sebelumnya
  // ikut terhitung dan test jadi bergantung urutan.
  await closeRateLimitStore();

  scopes = ["posts:read", "ai:write"];
  keyId = "key_default";
  verifyCalls = [];
  dispatched = [];

  vi.spyOn(apiKeyModule, "verifyApiKey").mockImplementation(async (raw) => {
    verifyCalls.push(raw);
    return raw ? makeAuth(keyId, scopes) : null;
  });
  vi.spyOn(billingModule, "checkPlanFeature").mockResolvedValue(undefined);

  registerMcpDispatch(async (request) => {
    const url = new URL(request.url);
    dispatched.push({
      method: request.method,
      path: url.pathname + url.search,
      authorization: request.headers.get("authorization"),
    });
    if (url.pathname === "/v1/ping") {
      return Response.json({ ok: true, key: { scopes } });
    }
    return Response.json({ ok: true, path: url.pathname });
  });
});

describe("autentikasi", () => {
  it("401 tanpa header Authorization, dan tidak ada tool yang dijalankan", async () => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(INIT),
    });
    expect(res.status).toBe(401);
    expect(dispatched).toHaveLength(0);
    expect(verifyCalls).toEqual([null]);
  });

  it("401 untuk token yang tidak valid", async () => {
    vi.spyOn(apiKeyModule, "verifyApiKey").mockResolvedValue(null);
    const res = await post(INIT);
    expect(res.status).toBe(401);
    expect(dispatched).toHaveLength(0);
  });

  it("402 bila plan organisasi tidak punya api_access", async () => {
    // Error handler global mencatat kegagalan ke console — di sini memang
    // disengaja, jadi jangan kotori log test dengan stack trace palsu.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(billingModule, "checkPlanFeature").mockRejectedValue(new Error("upgrade paket"));
    const res = await post(INIT);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(dispatched).toHaveLength(0);
  });
});

describe("handshake", () => {
  it("initialize mengembalikan identitas server", async () => {
    const res = await post(INIT);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(body.result?.serverInfo?.name).toBe("sahabatkreator");
  });

  it("tools/list hanya memuat tool sesuai scope token", async () => {
    const res = await post(rpc("tools/list", {}, 2));
    const body = (await res.json()) as { result?: { tools?: { name: string }[] } };
    const names = (body.result?.tools ?? []).map((t) => t.name).sort();

    expect(names).toContain("ping");
    expect(names).toContain("list_posts");
    expect(names).toContain("ai_caption");
    // accounts:read / analytics:read tidak ada di token ini
    expect(names).not.toContain("list_accounts");
    expect(names).not.toContain("analytics_overview");
  });

  it("token read-only tidak pernah melihat tool tulis", async () => {
    scopes = ["posts:read"];
    const res = await post(rpc("tools/list", {}, 3));
    const body = (await res.json()) as { result?: { tools?: { name: string }[] } };
    const names = (body.result?.tools ?? []).map((t) => t.name);

    expect(names).toContain("list_posts");
    expect(names).not.toContain("ai_caption");
  });

  it("GET /mcp ditolak 405 di mode stateless", async () => {
    const res = await app.request("/mcp", {
      method: "GET",
      headers: { accept: "text/event-stream", authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(405);
  });

  it("body JSON rusak → 400 berbentuk JSON-RPC", async () => {
    const res = await post("{bukan json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: number } };
    expect(body.error?.code).toBe(-32700);
  });

  it("path /mcp/ (trailing slash) juga dilayani", async () => {
    const res = await app.request("/mcp/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(INIT),
    });
    expect(res.status).toBe(200);
  });
});

describe("tools/call — subrequest ke /v1", () => {
  it("GET tool diteruskan sebagai GET /v1 dengan query dari argumen", async () => {
    const res = await post(
      rpc("tools/call", { name: "list_posts", arguments: { status: "draft", page: 2 } }, 4),
    );
    expect(res.status).toBe(200);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.method).toBe("GET");
    expect(dispatched[0]?.path).toBe("/v1/posts?status=draft&page=2");
    // Kredensial pemanggil yang diteruskan — bukan kredensial server.
    expect(dispatched[0]?.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("path param disubstitusi, bukan dikirim sebagai query", async () => {
    await post(rpc("tools/call", { name: "get_post", arguments: { id: "pg_9" } }, 5));
    expect(dispatched[0]?.path).toBe("/v1/posts/pg_9");
  });

  it("POST tool diteruskan sebagai POST dengan body JSON", async () => {
    await post(
      rpc(
        "tools/call",
        { name: "ai_caption", arguments: { prompt: "tips foto", platform: "instagram" } },
        6,
      ),
    );
    expect(dispatched[0]?.method).toBe("POST");
    expect(dispatched[0]?.path).toBe("/v1/ai/caption");
  });

  it("error dari /v1 dilaporkan sebagai hasil tool yang gagal", async () => {
    registerMcpDispatch(async () =>
      Response.json({ message: 'Key ini tidak memiliki scope "posts:read".' }, { status: 403 }),
    );
    const res = await post(rpc("tools/call", { name: "list_posts", arguments: {} }, 7));
    const body = (await res.json()) as {
      result?: { isError?: boolean; content?: { text?: string }[] };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toContain("403");
  });

  it("tool di luar scope token tidak bisa dipanggil", async () => {
    const res = await post(rpc("tools/call", { name: "list_accounts", arguments: {} }, 8));
    const body = (await res.json()) as {
      error?: unknown;
      result?: { isError?: boolean };
    };
    // SDK menjawab "Unknown tool" (error JSON-RPC atau hasil isError) — yang
    // penting: tidak ada request ke /v1/accounts.
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(dispatched.some((d) => d.path.startsWith("/v1/accounts"))).toBe(false);
  });
});

describe("rate limit", () => {
  it("tools/call TIDAK menagih limiter envelope (kuotanya milik /v1)", async () => {
    // 130 > max 120: kalau skip-nya bocor, request ke-121 akan jadi 429.
    for (let i = 0; i < 130; i++) {
      const res = await post(rpc("tools/call", { name: "list_posts", arguments: {} }, 100 + i));
      expect(res.status, `request ke-${i + 1}`).toBe(200);
    }
    expect(dispatched).toHaveLength(130);
  });

  it("permukaan handshake tetap dibatasi, dan 429-nya berbentuk JSON-RPC", async () => {
    let limited: Response | null = null;
    for (let i = 0; i < 125; i++) {
      const res = await post(rpc("tools/list", {}, 200 + i));
      if (res.status === 429) {
        limited = res;
        break;
      }
    }

    expect(limited, "limiter envelope tidak pernah aktif").not.toBeNull();
    expect(limited?.headers.get("Retry-After")).toBeTruthy();
    const body = (await limited?.json()) as { jsonrpc?: string; error?: { code?: number } };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error?.code).toBe(-32000);
  });

  it("bucket terpisah per key", async () => {
    keyId = "key_a";
    for (let i = 0; i < 121; i++) await post(rpc("tools/list", {}, 300 + i));

    // key lain mulai dari nol — bukan ikut terblokir
    keyId = "key_b";
    const res = await post(rpc("tools/list", {}, 400), OTHER_TOKEN);
    expect(res.status).toBe(200);
  });
});
