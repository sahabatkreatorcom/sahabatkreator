// Test gerbang endpoint authorize (RFC rfc-oauth-connect.md §5.2).
//
// Fokus: urutan gerbangnya benar dan TIDAK ada jalur yang melewati salah satunya.
// Yang paling mudah salah: `publicApiPlanGate` melewatkan gate `api_write` untuk
// method safe, jadi endpoint GET ini harus menegakkannya sendiri.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../lib/auth-guard";

const mocks = vi.hoisted(() => ({
  checkPlanFeature: vi.fn(),
  resolveDeveloperApp: vi.fn(),
  startOAuthFlow: vi.fn(),
}));

// importOriginal dipakai supaya implementasi asli tetap ada untuk fungsi lain di
// modul yang sama (mis. assertAllowedRedirect) — yang diganti hanya bagian DB.
vi.mock("../lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/billing")>();
  return { ...actual, checkPlanFeature: mocks.checkPlanFeature, checkFeatureGate: vi.fn() };
});

vi.mock("../lib/developer-app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/developer-app")>();
  return { ...actual, resolveDeveloperApp: mocks.resolveDeveloperApp };
});

vi.mock("./oauth/start", () => ({ startOAuthFlow: mocks.startOAuthFlow }));

const { accountsRoute } = await import("./accounts");

const APP = {
  id: "devapp_1",
  name: "Contoh",
  allowedRedirectUris: ["https://app.dev/cb"],
};

function apiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "key_1",
    name: "Key",
    tokenPrefix: "sk_api_x",
    organizationId: "org_1",
    scopes: ["accounts:write"],
    developerAppId: "devapp_1",
    ...overrides,
  };
}

function request(key: unknown, query = "redirect=https%3A%2F%2Fapp.dev%2Fcb") {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (key) c.set("apiKey", key as never);
    await next();
  });
  app.route("/accounts", accountsRoute);
  return app.request(`/accounts/tiktok/authorize?${query}`);
}

beforeEach(() => {
  mocks.checkPlanFeature.mockReset();
  mocks.resolveDeveloperApp.mockReset();
  mocks.startOAuthFlow.mockReset();
  mocks.checkPlanFeature.mockResolvedValue(undefined);
  mocks.resolveDeveloperApp.mockResolvedValue(APP);
  mocks.startOAuthFlow.mockResolvedValue(Response.json({ authorizeUrl: "https://p/oauth" }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /accounts/:platform/authorize", () => {
  it("tanpa API key (jalur session) → 403", async () => {
    const res = await request(undefined);
    expect(res.status).toBe(403);
    expect(mocks.checkPlanFeature).not.toHaveBeenCalled();
  });

  it("plan tanpa api_write → 402, sebelum menyentuh app developer", async () => {
    mocks.checkPlanFeature.mockRejectedValue(new HTTPError(402, "Plan tidak mendukung"));

    const res = await request(apiKey());

    expect(res.status).toBe(402);
    expect(mocks.resolveDeveloperApp).not.toHaveBeenCalled();
    expect(mocks.startOAuthFlow).not.toHaveBeenCalled();
  });

  it("key tanpa developer app aktif → 403 (tidak ada allowlist redirect)", async () => {
    mocks.resolveDeveloperApp.mockResolvedValue(null);

    const res = await request(apiKey({ developerAppId: null }));

    expect(res.status).toBe(403);
    expect(mocks.startOAuthFlow).not.toHaveBeenCalled();
  });

  it("tanpa parameter redirect → 400", async () => {
    const res = await request(apiKey(), "platform=instagram");
    expect(res.status).toBe(400);
    expect(mocks.startOAuthFlow).not.toHaveBeenCalled();
  });

  it("redirect di luar allowlist → 400", async () => {
    const res = await request(apiKey(), "redirect=https%3A%2F%2Fjahat.example%2Fcb");

    expect(res.status).toBe(400);
    expect(mocks.startOAuthFlow).not.toHaveBeenCalled();
  });

  it("skema javascript: → 400", async () => {
    const res = await request(apiKey(), "redirect=javascript%3Aalert(1)");

    expect(res.status).toBe(400);
    expect(mocks.startOAuthFlow).not.toHaveBeenCalled();
  });

  it("semua gerbang lolos → start flow ditandai milik developer app", async () => {
    const res = await request(apiKey());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authorizeUrl: "https://p/oauth" });
    // Inilah yang membuat callback berhenti jadi proxy (tidak connect).
    expect(mocks.startOAuthFlow).toHaveBeenCalledWith(expect.anything(), {
      developerAppId: "devapp_1",
      redirectUri: "https://app.dev/cb",
    });
  });
});
