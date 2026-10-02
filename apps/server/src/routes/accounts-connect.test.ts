// Test endpoint connect lewat API (RFC rfc-oauth-connect.md fase 3).
//
// Yang dijaga:
//   1. Kontrak POLIMORFIK: platform asset-selection TIDAK boleh mengembalikan
//      400 — ia mengembalikan `{ pendingId, assets }`. Kalau ini rusak, developer
//      terpaksa menyalin daftar platform internal kita (§4.3).
//   2. Organisasi selalu diambil dari konteks auth (API key), bukan dari body.
//   3. `GET /pending/:id` di jalur API menegakkan `api_write` sendiri — GET
//      adalah method safe, jadi `publicApiPlanGate` melewatkannya.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../lib/auth-guard";

const mocks = vi.hoisted(() => ({
  checkPlanFeature: vi.fn(),
  connectWithCode: vi.fn(),
  startOAuthFlow: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({ selectRows: [] as unknown[] }));

vi.mock("@sahabatkreator/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(dbMock.selectRows) }) }),
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));

vi.mock("../lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/billing")>();
  return { ...actual, checkPlanFeature: mocks.checkPlanFeature, checkFeatureGate: vi.fn() };
});

vi.mock("./oauth/start", () => ({ startOAuthFlow: mocks.startOAuthFlow }));
vi.mock("./oauth/connect", () => ({ connectWithCode: mocks.connectWithCode }));

// Konteks auth: organisasi & user datang dari sini, bukan dari request body.
vi.mock("../lib/auth-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth-guard")>();
  // Route kini memakai requirePermission (bukan requireOrg). Tes ini fokus pada
  // scoping org/API key, bukan otorisasi permission — jadi keduanya di-stub agar
  // mengembalikan konteks yang sama.
  const ctx = {
    user: { id: "user_1", name: "Uji", email: "uji@example.com" },
    sessionId: "sess_1",
    organization: { id: "org_1", role: "member", name: "Org" },
  };
  return {
    ...actual,
    requireOrg: async () => ctx,
    requirePermission: async () => ctx,
  };
});

const { accountsRoute } = await import("./accounts");

const KEY = {
  id: "key_1",
  name: "Key",
  tokenPrefix: "sk_api_x",
  organizationId: "org_1",
  scopes: ["accounts:write"],
  developerAppId: "devapp_1",
};

/** App dengan middleware penanda "request lewat API key" (opsional). */
function app(key?: unknown) {
  const a = new Hono();
  a.use("*", async (c, next) => {
    if (key) c.set("apiKey", key as never);
    await next();
  });
  a.route("/accounts", accountsRoute);
  return a;
}

function post(path: string, body: unknown, key?: unknown) {
  return app(key).request(`/accounts${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dbMock.selectRows = [];
  mocks.checkPlanFeature.mockReset();
  mocks.connectWithCode.mockReset();
  mocks.startOAuthFlow.mockReset();
  mocks.checkPlanFeature.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /accounts/:platform/connect", () => {
  it("akun langsung terhubung → { accountId }", async () => {
    mocks.connectWithCode.mockResolvedValue({ kind: "connected", accountId: "socacc_1" });

    const res = await post("/tiktok/connect", { code: "abc" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accountId: "socacc_1" });
  });

  it("platform butuh pemilihan aset → { pendingId, assets }, BUKAN 400", async () => {
    mocks.connectWithCode.mockResolvedValue({
      kind: "pending",
      pendingId: "oauthpend_1",
      assets: [
        {
          id: "page_1",
          name: "Page Satu",
          username: "igsatu",
          picture: null,
          hasInstagram: true,
          isPersonal: false,
        },
      ],
    });

    const res = await post("/instagram/connect", { code: "abc" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pendingId?: string;
      accountId?: string;
      assets?: unknown[];
    };
    expect(body.pendingId).toBe("oauthpend_1");
    expect(body.assets).toHaveLength(1);
    expect(body.accountId).toBeUndefined();
  });

  it("akun sudah terhubung di organisasi lain → 409", async () => {
    mocks.connectWithCode.mockResolvedValue({ kind: "conflict" });

    const res = await post("/facebook/connect", { code: "abc" });

    expect(res.status).toBe(409);
  });

  it("platform tanpa entitas (mis. Pinterest tanpa board) → 400 + pesan", async () => {
    mocks.connectWithCode.mockResolvedValue({
      kind: "error",
      message: "Akun Pinterest tidak memiliki board.",
    });

    const res = await post("/pinterest/connect", { code: "abc" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Akun Pinterest tidak memiliki board." });
  });

  it("code kosong → 400 dan platform tidak disentuh", async () => {
    const res = await post("/tiktok/connect", { code: "" });

    expect(res.status).toBe(400);
    expect(mocks.connectWithCode).not.toHaveBeenCalled();
  });

  it("organisasi diambil dari konteks auth, bukan dari body", async () => {
    mocks.connectWithCode.mockResolvedValue({ kind: "connected", accountId: "socacc_1" });

    await post("/tiktok/connect", {
      code: "abc",
      organizationId: "org_jahat",
      userId: "user_jahat",
    });

    expect(mocks.connectWithCode).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "tiktok",
        code: "abc",
        organizationId: "org_1",
        userId: "user_1",
      }),
    );
  });
});

describe("POST /accounts/:platform/exchange", () => {
  it("memakai implementasi yang sama dengan connect", async () => {
    mocks.connectWithCode.mockResolvedValue({
      kind: "pending",
      pendingId: "oauthpend_9",
      assets: [],
    });

    const res = await post("/pinterest/exchange", { code: "abc" });

    expect(res.status).toBe(200);
    expect((await res.json()) as { pendingId: string }).toMatchObject({
      pendingId: "oauthpend_9",
    });
    expect(mocks.connectWithCode).toHaveBeenCalledTimes(1);
  });
});

describe("gate api_write untuk endpoint GET di jalur API", () => {
  it("GET /pending/:id lewat API key menegakkan api_write", async () => {
    mocks.checkPlanFeature.mockRejectedValue(new HTTPError(402, "Plan tidak mendukung"));

    const res = await app(KEY).request("/accounts/pending/pend_1");

    expect(res.status).toBe(402);
    expect(mocks.checkPlanFeature).toHaveBeenCalledWith("org_1", "api_write");
  });

  it("jalur sesi (tanpa API key) tidak di-gate api_write", async () => {
    const res = await app().request("/accounts/pending/pend_1");

    expect(mocks.checkPlanFeature).not.toHaveBeenCalled();
    // 404 dari db mock — yang penting bukan 402.
    expect(res.status).not.toBe(402);
  });
});
