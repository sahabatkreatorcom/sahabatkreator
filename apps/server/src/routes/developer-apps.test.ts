// Test CRUD developer app (RFC rfc-oauth-connect.md fase 4).
//
// Yang dijaga:
//   1. Allowlist hanya bisa diisi URI yang BENTUK-nya sah — memakai validator
//      yang sama dengan `assertAllowedRedirect`. Kalau tidak, developer bisa
//      mendaftar sukses lalu setiap `authorize` gagal tanpa sebab jelas.
//   2. Isolasi org: app org lain tidak bisa dibaca/diubah/dinonaktifkan.
//   3. DELETE = NONAKTIFKAN, bukan hapus baris — karena FK `api_key.developer_app_id`
//      itu cascade, hard delete akan ikut menghapus key yang scopenya tidak
//      berhubungan dengan connect.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../lib/auth-guard";

const dbMock = vi.hoisted(() => ({
  /** Antrean hasil `select()` — diambil berurutan sesuai urutan pemanggilan. */
  selectQueue: [] as unknown[][],
  inserted: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  updateReturn: [] as unknown[],
}));

const mocks = vi.hoisted(() => ({ checkPlanFeature: vi.fn() }));

/**
 * `where()` harus thenable (sebagian rantai Drizzle di-await langsung tanpa
 * `.orderBy()`/`.limit()`) TAPI juga punya `orderBy()` — jadi mock-nya dua-duanya.
 */
function thenable(rows: unknown[]) {
  const p = Promise.resolve(rows);
  return {
    orderBy: () => p,
    // biome-ignore lint/suspicious/noThenProperty: sengaja thenable, lihat komentar di atas
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
}

vi.mock("@sahabatkreator/db", () => ({
  db: {
    select: () => {
      const rows = dbMock.selectQueue.shift() ?? [];
      return { from: () => ({ where: () => thenable(rows) }) };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          dbMock.inserted.push(v);
          return Promise.resolve([
            { ...v, isActive: true, createdAt: new Date(), updatedAt: new Date() },
          ]);
        },
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            dbMock.updated.push(v);
            return Promise.resolve(dbMock.updateReturn);
          },
        }),
      }),
    }),
  },
}));

vi.mock("../lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/billing")>();
  return { ...actual, checkPlanFeature: mocks.checkPlanFeature };
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

const { developerAppRoute } = await import("./developer-apps");

const app = new Hono();
app.route("/developer-apps", developerAppRoute);

function post(body: unknown) {
  return app.request("/developer-apps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(id: string, body: unknown) {
  return app.request(`/developer-apps/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function appRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sk_devapp_1",
    name: "Dashboard Klien",
    allowedRedirectUris: ["https://app.dev/cb"],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  dbMock.selectQueue = [];
  dbMock.inserted = [];
  dbMock.updated = [];
  dbMock.updateReturn = [];
  mocks.checkPlanFeature.mockReset();
  mocks.checkPlanFeature.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /developer-apps", () => {
  it("mengembalikan app org + keyCount (key dicabut tidak dihitung)", async () => {
    dbMock.selectQueue = [
      [appRow(), appRow({ id: "sk_devapp_2", name: "Staging" })],
      [
        { developerAppId: "sk_devapp_1", revokedAt: null },
        { developerAppId: "sk_devapp_1", revokedAt: null },
        { developerAppId: "sk_devapp_1", revokedAt: new Date() }, // dicabut → tidak dihitung
        { developerAppId: null, revokedAt: null }, // key tanpa app
      ],
    ];

    const res = await app.request("/developer-apps");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { apps: { id: string; keyCount: number }[] };
    expect(body.apps[0]?.keyCount).toBe(2);
    expect(body.apps[1]?.keyCount).toBe(0);
  });
});

describe("POST /developer-apps", () => {
  it("mendaftarkan app + allowlist", async () => {
    const res = await post({
      name: "Dashboard Klien",
      allowedRedirectUris: ["https://app.dev/cb"],
    });

    expect(res.status).toBe(201);
    expect(dbMock.inserted[0]).toMatchObject({
      organizationId: "org_1",
      name: "Dashboard Klien",
      allowedRedirectUris: ["https://app.dev/cb"],
    });
  });

  it("dedupe URI kembar (tidak berbahaya tapi menyesatkan di UI)", async () => {
    await post({
      name: "Dobel",
      allowedRedirectUris: ["https://app.dev/cb", "https://app.dev/cb"],
    });

    expect(dbMock.inserted[0]?.allowedRedirectUris).toEqual(["https://app.dev/cb"]);
  });

  it("URI javascript: → 400 dan tidak menyentuh DB", async () => {
    const res = await post({ name: "Jahat", allowedRedirectUris: ["javascript:alert(1)"] });

    expect(res.status).toBe(400);
    expect(dbMock.inserted).toHaveLength(0);
  });

  it("http ke non-loopback → 400 (walau nanti didaftarkan persis)", async () => {
    const res = await post({ name: "Http", allowedRedirectUris: ["http://app.dev/cb"] });

    expect(res.status).toBe(400);
    expect(dbMock.inserted).toHaveLength(0);
  });

  it("URI ber-fragment → 400 (fragment menelan `code` di callback)", async () => {
    const res = await post({ name: "Fragment", allowedRedirectUris: ["https://app.dev/cb#x"] });

    expect(res.status).toBe(400);
    expect(dbMock.inserted).toHaveLength(0);
  });

  it("http ke localhost DITERIMA (developer menguji di mesin sendiri)", async () => {
    const res = await post({ name: "Lokal", allowedRedirectUris: ["http://localhost:4000/cb"] });

    expect(res.status).toBe(201);
  });

  it("saat sudah mencapai batas app per org → 400", async () => {
    dbMock.selectQueue = [[appRow(), appRow(), appRow(), appRow(), appRow()]];

    const res = await post({ name: "Keenam", allowedRedirectUris: ["https://app.dev/cb"] });

    expect(res.status).toBe(400);
    expect(dbMock.inserted).toHaveLength(0);
  });

  it("plan tanpa api_access → 402 sebelum validasi apa pun", async () => {
    mocks.checkPlanFeature.mockRejectedValue(new HTTPError(402, "Plan tidak mendukung"));

    const res = await post({ name: "X", allowedRedirectUris: ["https://app.dev/cb"] });

    expect(res.status).toBe(402);
    expect(dbMock.inserted).toHaveLength(0);
  });
});

describe("PATCH /developer-apps/:id", () => {
  it("memperbarui allowlist", async () => {
    dbMock.updateReturn = [appRow({ allowedRedirectUris: ["https://baru.dev/cb"] })];

    const res = await patch("sk_devapp_1", {
      allowedRedirectUris: ["https://baru.dev/cb"],
    });

    expect(res.status).toBe(200);
    expect(dbMock.updated[0]?.allowedRedirectUris).toEqual(["https://baru.dev/cb"]);
  });

  it("app org lain → 404 (where memuat organizationId, jadi 0 baris ter-update)", async () => {
    dbMock.updateReturn = [];

    const res = await patch("sk_devapp_org_lain", { name: "Bajak" });

    expect(res.status).toBe(404);
  });

  it("URI tidak sah saat update → 400", async () => {
    const res = await patch("sk_devapp_1", { allowedRedirectUris: ["data:text/html,x"] });

    expect(res.status).toBe(400);
    expect(dbMock.updated).toHaveLength(0);
  });
});

describe("DELETE /developer-apps/:id", () => {
  it("MENONAKTIFKAN app, bukan menghapus baris", async () => {
    // Kalau ini jadi hard delete, FK cascade di api_key.developer_app_id ikut
    // menghapus SEMUA key app itu — termasuk key dengan scope lain.
    dbMock.updateReturn = [appRow({ isActive: false })];

    const res = await app.request("/developer-apps/sk_devapp_1", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(dbMock.updated[0]).toMatchObject({ isActive: false });
    // Tidak ada operasi delete sama sekali (mock db tidak menyediakan `delete`).
    expect(dbMock.updated[0]).not.toHaveProperty("name");
  });

  it("app tidak ada / org lain → 404", async () => {
    dbMock.updateReturn = [];

    const res = await app.request("/developer-apps/sk_devapp_2", { method: "DELETE" });

    expect(res.status).toBe(404);
  });
});
