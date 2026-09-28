// Test untuk tabel tool MCP bersama.
//
// Yang diuji di sini bukan "apakah fungsinya jalan" saja, tapi juga INVARIAN
// yang menjaga tabel tetap sinkron dengan allowlist /v1: setiap path harus
// menunjuk ke Public API, nama tool unik, dan scope berformat benar. Tanpa
// invarian ini, typo pada path baru ketahuan dari keluhan pelanggan.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assertToolScope,
  buildToolRequest,
  MCP_TOOLS,
  type McpToolDef,
  visibleTools,
} from "./tools";

function tool(name: string): McpToolDef {
  const found = MCP_TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" tidak ada di MCP_TOOLS`);
  return found;
}

describe("buildToolRequest — pemetaan argumen ke request /v1", () => {
  it("GET menaruh argumen di query string", () => {
    const req = buildToolRequest(tool("list_posts"), { status: "draft", perPage: 10 });
    expect(req.path).toBe("/v1/posts?status=draft&perPage=10");
    expect(req.body).toBeUndefined();
  });

  it("membuang argumen undefined, bukan mengirim 'undefined'", () => {
    const req = buildToolRequest(tool("list_posts"), {
      status: undefined,
      page: 2,
      perPage: undefined,
    });
    expect(req.path).toBe("/v1/posts?page=2");
  });

  it("GET tanpa argumen tidak menambah tanda tanya", () => {
    expect(buildToolRequest(tool("list_accounts")).path).toBe("/v1/accounts");
    expect(buildToolRequest(tool("list_accounts"), {}).path).toBe("/v1/accounts");
  });

  it("meng-encode nilai query", () => {
    const req = buildToolRequest(tool("list_posts"), { status: "a b&c" });
    expect(req.path).toBe("/v1/posts?status=a%20b%26c");
  });

  it("segmen {id} di path disubstitusi dan tidak ikut ke query", () => {
    const req = buildToolRequest(tool("get_post"), { id: "pg_123" });
    expect(req.path).toBe("/v1/posts/pg_123");
    expect(req.body).toBeUndefined();
  });

  it("meng-encode nilai path param", () => {
    expect(buildToolRequest(tool("get_post"), { id: "a/b" }).path).toBe("/v1/posts/a%2Fb");
  });

  it("POST mode body menaruh argumen di body, bukan query", () => {
    const req = buildToolRequest(tool("ai_caption"), {
      prompt: "tips foto produk",
      platform: "instagram",
      tone: "santai",
    });
    expect(req.path).toBe("/v1/ai/caption");
    expect(req.body).toEqual({
      prompt: "tips foto produk",
      platform: "instagram",
      tone: "santai",
    });
  });

  it("POST mode body membuang optional yang undefined", () => {
    const req = buildToolRequest(tool("ai_caption"), {
      prompt: "tips foto produk",
      platform: "instagram",
      tone: undefined,
    });
    expect(req.body).toEqual({ prompt: "tips foto produk", platform: "instagram" });
  });

  it("path param tidak pernah muncul lagi di body (POST dengan segmen dinamis)", () => {
    // Tidak ada tool POST berpath dinamis di tabel saat ini — dipakai tool
    // sintetis supaya aturan "path param tidak boleh dobel" tetap terjaga
    // ketika nanti ada POST /v1/posts/{id}/something.
    const synthetic: McpToolDef = {
      name: "synthetic",
      description: "POST dengan segmen dinamis",
      scope: "",
      method: "POST",
      path: "/v1/things/{id}/publish",
      mode: "body",
      params: { id: z.string(), note: z.string().optional() },
    };
    const req = buildToolRequest(synthetic, { id: "t_1", note: "halo" });
    expect(req.path).toBe("/v1/things/t_1/publish");
    expect(req.body).toEqual({ note: "halo" });
  });

  it("DELETE tidak mengirim body", () => {
    const synthetic: McpToolDef = {
      name: "synthetic-delete",
      description: "hapus",
      scope: "posts:write",
      method: "DELETE",
      path: "/v1/posts/{id}",
      params: { id: z.string() },
    };
    const req = buildToolRequest(synthetic, { id: "pg_1" });
    expect(req.path).toBe("/v1/posts/pg_1");
    expect(req.body).toBeUndefined();
  });
});

describe("visibleTools — tool mengikuti scope token", () => {
  it("token tanpa scope hanya melihat ping", () => {
    expect(visibleTools([]).map((t) => t.name)).toEqual(["ping"]);
  });

  it("token read-only tidak pernah melihat tool tulis", () => {
    const names = visibleTools(["posts:read", "analytics:read"]).map((t) => t.name);
    expect(names).toContain("list_posts");
    expect(names).toContain("analytics_overview");
    expect(names).not.toContain("ai_caption");
    expect(names).not.toContain("ai_hashtag");
  });

  it("scope tulis membuka tool tulis", () => {
    const names = visibleTools(["ai:write"]).map((t) => t.name);
    expect(names).toContain("ai_caption");
    expect(names).toContain("ai_hashtag");
    // ai:write bukan superset ai:read — trends tetap tersembunyi
    expect(names).not.toContain("trends");
  });
});

describe("assertToolScope", () => {
  it("lolos untuk tool tanpa scope", () => {
    expect(() => assertToolScope(tool("ping"), [])).not.toThrow();
  });

  it("lolos bila scope dimiliki", () => {
    expect(() => assertToolScope(tool("list_posts"), ["posts:read"])).not.toThrow();
  });

  it("melempar pesan yang menyebut scope-nya bila tidak dimiliki", () => {
    expect(() => assertToolScope(tool("list_posts"), ["analytics:read"])).toThrow(/posts:read/);
  });
});

describe("invarian MCP_TOOLS", () => {
  it("setiap tool menunjuk ke Public API /v1", () => {
    for (const t of MCP_TOOLS) {
      expect(t.path, `tool ${t.name}`).toMatch(/^\/v1\//);
    }
  });

  it("nama tool unik", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("scope berformat <resource>:read|write atau kosong", () => {
    for (const t of MCP_TOOLS) {
      expect(t.scope, `tool ${t.name}`).toMatch(/^$|^[a-z]+:(read|write)$/);
    }
  });

  it("hanya GET yang memakai query; mode body hanya untuk method berbody", () => {
    for (const t of MCP_TOOLS) {
      if (t.mode === "body") {
        expect(t.method, `tool ${t.name}`).not.toBe("GET");
      }
    }
  });

  it("schema params bisa dipakai sebagai inputSchema MCP (z.object(...).shape)", () => {
    for (const t of MCP_TOOLS) {
      const schema = t.params ? z.object(t.params) : z.object({}).describe("tanpa parameter");
      expect(typeof schema.shape).toBe("object");
    }
  });

  it("schema ai_caption menolak platform yang tidak dikenal", () => {
    const schema = z.object(tool("ai_caption").params ?? {});
    expect(schema.safeParse({ prompt: "halo", platform: "myspace" }).success).toBe(false);
    expect(schema.safeParse({ prompt: "halo", platform: "instagram" }).success).toBe(true);
  });
});
