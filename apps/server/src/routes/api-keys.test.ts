// Test pengikatan API key ke developer app (RFC rfc-oauth-connect.md fase 4).
//
// MENGAPA ini perlu diuji: tanpa pengikatan ini, `api_key.developer_app_id` hanya
// bisa diisi langsung lewat DB — artinya fitur connect akun lewat API tidak
// pernah bisa dipakai pelanggan, walaupun seluruh endpoint-nya sudah ada.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../lib/auth-guard";

const dbMock = vi.hoisted(() => ({
  /** Hasil select untuk hitung key aktif. */
  activeKeys: [] as unknown[],
  inserted: [] as Record<string, unknown>[],
}));

const mocks = vi.hoisted(() => ({
  checkPlanFeature: vi.fn(),
  resolveDeveloperApp: vi.fn(),
}));

/** Rantai select di route ini di-await langsung (tanpa `.orderBy()`), jadi harus thenable. */
function thenable(rows: unknown[]) {
  const p = Promise.resolve(rows);
  return {
    // biome-ignore lint/suspicious/noThenProperty: sengaja thenable, lihat komentar di atas
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
}

vi.mock("@sahabatkreator/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => thenable(dbMock.activeKeys) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          dbMock.inserted.push(v);
          return Promise.resolve([v]);
        },
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
  },
}));

vi.mock("../lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/billing")>();
  return { ...actual, checkPlanFeature: mocks.checkPlanFeature };
});

vi.mock("../lib/developer-app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/developer-app")>();
  return { ...actual, resolveDeveloperApp: mocks.resolveDeveloperApp };
});

vi.mock("../lib/auth-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth-guard")>();
  return {
    ...actual,
    requireOrgAdmin: async () => ({
      user: { id: "user_1", name: "Admin", email: "admin@example.com" },
      sessionId: "sess_1",
      organization: { id: "org_1", role: "owner", name: "Org" },
    }),
  };
});

const { apiKeyRoute } = await import("./api-keys");

const app = new Hono();
app.route("/api-keys", apiKeyRoute);

function post(body: unknown) {
  return app.request("/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dbMock.activeKeys = [];
  dbMock.inserted = [];
  mocks.checkPlanFeature.mockReset();
  mocks.resolveDeveloperApp.mockReset();
  mocks.checkPlanFeature.mockResolvedValue(undefined);
  mocks.resolveDeveloperApp.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api-keys — pengikatan developer app", () => {
  it("tanpa developerAppId → key biasa (kolom null)", async () => {
    const res = await post({ name: "Zapier", scopes: ["posts:read"] });

    expect(res.status).toBe(201);
    expect(dbMock.inserted[0]?.developerAppId).toBeNull();
    expect(mocks.resolveDeveloperApp).not.toHaveBeenCalled();
  });

  it("dengan developerAppId sah → key terikat app itu", async () => {
    mocks.resolveDeveloperApp.mockResolvedValue({
      id: "sk_devapp_1",
      name: "Dashboard Klien",
      allowedRedirectUris: ["https://app.dev/cb"],
    });

    const res = await post({
      name: "Connect",
      scopes: ["accounts:write"],
      developerAppId: "sk_devapp_1",
    });

    expect(res.status).toBe(201);
    expect(dbMock.inserted[0]?.developerAppId).toBe("sk_devapp_1");
    // Org dari konteks auth dipakai untuk resolusi — bukan org dari body.
    expect(mocks.resolveDeveloperApp).toHaveBeenCalledWith("sk_devapp_1", "org_1");
  });

  it("app milik org lain / nonaktif → 400 dan key TIDAK dibuat", async () => {
    // `resolveDeveloperApp` memakai org sebagai kondisi query, jadi app org lain
    // mengembalikan null — key tidak boleh lahir dengan allowlist orang lain.
    mocks.resolveDeveloperApp.mockResolvedValue(null);

    const res = await post({
      name: "Bajak",
      scopes: ["accounts:write"],
      developerAppId: "sk_devapp_org_lain",
    });

    expect(res.status).toBe(400);
    expect(dbMock.inserted).toHaveLength(0);
  });

  it("plan tanpa api_access → 402 sebelum validasi app", async () => {
    mocks.checkPlanFeature.mockRejectedValue(new HTTPError(402, "Plan tidak mendukung"));

    const res = await post({ name: "X", scopes: ["accounts:read"] });

    expect(res.status).toBe(402);
    expect(mocks.resolveDeveloperApp).not.toHaveBeenCalled();
    expect(dbMock.inserted).toHaveLength(0);
  });
});
