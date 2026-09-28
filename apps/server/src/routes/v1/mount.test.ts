// Regresi untuk bug "middleware modul tidak ikut tersalin ke /v1" (audit 27 Sep).
//
// Hono 4.x mendaftar `app.use("*", mw)` dengan method "ALL" (METHOD_NAME_ALL),
// bukan "*". Versi mount.ts lama cuma cek `"*"` → gate modul (aiRateLimit,
// gateFeature) diam-diam hilang dari /v1. Test ini memastikan middleware
// `use("*")` di source IKUT di-mount, apa pun representasi internal Hono.
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type MountSpec, mountRoutes } from "./mount";

describe("mountRoutes — middleware modul ikut ke /v1", () => {
  it('middleware use("*") di source jalan di rute /v1 yang di-allowlist', async () => {
    let gateRan = false;
    const source = new Hono();
    source.use("*", async (_c, next) => {
      gateRan = true;
      await next();
    });
    source.get("/ping", (c) => c.json({ ok: true }));

    const parent = new Hono();
    mountRoutes(parent, "/v1", source, [{ method: "GET", path: "/ping", scope: "ping" as never }]);

    const res = await parent.request("/v1/ping");
    // 401 = requireScope menolak (tidak ada key di test) — itu bukan kegagalan
    // middleware copy; justru bukti scope gate ikut. Yang dites: gateRan.
    expect(gateRan).toBe(true);
    expect(res.status).toBe(401);
  });

  it("middleware use di-mount pada prefix lain juga jalan", async () => {
    const calls: string[] = [];
    const source = new Hono();
    source.use("*", async (_c, next) => {
      calls.push("gate");
      await next();
    });
    source.post("/echo", (c) => c.json({ ok: true }));

    const parent = new Hono();
    mountRoutes(parent, "/v1", source, [
      { method: "POST", path: "/echo", scope: "write" as never },
    ]);

    await parent.request("/v1/echo", { method: "POST" });
    expect(calls).toContain("gate");
  });

  it("handler di luar allowlist TIDAK boleh terbuka di /v1", async () => {
    const source = new Hono();
    source.get("/secret", (c) => c.json({ leak: true }));
    source.get("/public", (c) => c.json({ ok: true }));

    const parent = new Hono();
    mountRoutes(parent, "/v1", source, [
      { method: "GET", path: "/public", scope: "ping" as never },
    ]);

    const secret = await parent.request("/v1/secret");
    expect(secret.status).toBe(404);

    const pub = await parent.request("/v1/public");
    expect(pub.status).toBe(401); // scope gate, bukan 404 — rute ada & diproteksi
  });

  it("throw fail-fast bila allowlist tidak cocok dengan rute source", () => {
    const source = new Hono();
    source.get("/public", (c) => c.json({ ok: true }));

    const parent = new Hono();
    const specs: MountSpec[] = [
      { method: "GET", path: "/public", scope: "ping" as never },
      // rute ini tidak ada di source → harus throw saat boot
      { method: "GET", path: "/tidak-ada", scope: "ping" as never },
    ];

    expect(() => mountRoutes(parent, "/v1", source, specs)).toThrow(/tidak-ada/);
  });
});
