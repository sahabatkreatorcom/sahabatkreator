// Test cabang proxy di repliz-callback (RFC rfc-oauth-connect.md fase 3).
//
// MENGAPA ini penting: untuk platform bridge, `startOAuthFlow` mengarahkan
// authorize Repliz ke endpoint INI, bukan ke `redirectUri` developer — karena
// `redirect_uri` wajib terdaftar di app milik Repliz. Jadi tanpa cabang proxy di
// sini, developer tidak akan pernah menerima `code` untuk mayoritas platform
// (semua yang masih lewat Repliz), dan `POST /connect` mustahil dipanggil.
//
// Yang juga dijaga: jalur UI tidak boleh ikut berubah.
import { env } from "@sahabatkreator/env/server";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  deletedRows: [] as unknown[],
  selectRows: [] as unknown[],
}));

const connectViaRepliz = vi.hoisted(() => vi.fn());

vi.mock("@sahabatkreator/db", () => ({
  db: {
    delete: () => ({
      where: () => ({ returning: () => Promise.resolve(dbMock.deletedRows) }),
    }),
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(dbMock.selectRows) }) }),
    }),
  },
}));

vi.mock("../../lib/oauth-connect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/oauth-connect")>();
  return { ...actual, connectViaRepliz };
});

const { handleReplizCallback } = await import("./repliz-callback");

const app = new Hono();
app.get("/oauth/:platform/repliz-callback/:state", handleReplizCallback);

const WEB = env.WEB_URL;
const DEV_REDIRECT = "https://dev.example.com/cb";

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ost_1",
    state: "st1",
    platform: "facebook",
    organizationId: "org_1",
    userId: "user_1",
    developerAppId: null,
    redirectUri: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function call(query: string) {
  return app.request(`/oauth/facebook/repliz-callback/st1?${query}`);
}

beforeEach(() => {
  dbMock.deletedRows = [];
  dbMock.selectRows = [];
  connectViaRepliz.mockReset();
  connectViaRepliz.mockResolvedValue({ kind: "connected", accountId: "socacc_1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("jalur API (developerAppId terisi) — SK hanya proxy", () => {
  it("302 ke redirectUri developer dengan code Repliz & state, tanpa connect", async () => {
    dbMock.deletedRows = [stateRow({ developerAppId: "devapp_1", redirectUri: DEV_REDIRECT })];

    const res = await call("code=rplz-code&state=st1");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${DEV_REDIRECT}?code=rplz-code&state=st1`);
    // Bukti SK tidak menyentuh akun sama sekali di jalur ini.
    expect(connectViaRepliz).not.toHaveBeenCalled();
  });

  it("redirectUri yang sudah punya query string tidak dirusak", async () => {
    dbMock.deletedRows = [
      stateRow({ developerAppId: "devapp_1", redirectUri: `${DEV_REDIRECT}?lang=id` }),
    ];

    const res = await call("code=rplz&state=st1");

    expect(res.headers.get("location")).toBe(`${DEV_REDIRECT}?lang=id&code=rplz&state=st1`);
  });

  it("state API tanpa redirectUri → WEB_URL, bukan 500", async () => {
    dbMock.deletedRows = [stateRow({ developerAppId: "devapp_1", redirectUri: null })];

    const res = await call("code=rplz&state=st1");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(`${WEB}/accounts?connect_error=`);
  });
});

describe("jalur UI — hasil connectViaRepliz dipetakan ke redirect", () => {
  it("pending → /accounts?pending=", async () => {
    dbMock.deletedRows = [stateRow()];
    connectViaRepliz.mockResolvedValue({ kind: "pending", pendingId: "oauthpend_1", assets: [] });

    const res = await call("code=rplz&state=st1");

    expect(res.headers.get("location")).toBe(`${WEB}/accounts?pending=oauthpend_1`);
  });

  it("connected → connect_success", async () => {
    dbMock.deletedRows = [stateRow()];

    const res = await call("code=rplz&state=st1");

    expect(res.headers.get("location")).toBe(`${WEB}/accounts?connect_success=facebook`);
  });

  it("conflict → connect_error", async () => {
    dbMock.deletedRows = [stateRow()];
    connectViaRepliz.mockResolvedValue({ kind: "conflict" });

    const res = await call("code=rplz&state=st1");

    expect(res.headers.get("location")).toContain(`${WEB}/accounts?connect_error=`);
  });

  it("error → connect_error dengan pesan dari lib", async () => {
    dbMock.deletedRows = [stateRow()];
    connectViaRepliz.mockResolvedValue({
      kind: "error",
      message: "Bridge Repliz tidak aktif — hubungi admin",
    });

    const res = await call("code=rplz&state=st1");

    expect(decodeURIComponent(res.headers.get("location") ?? "")).toContain(
      "Bridge Repliz tidak aktif",
    );
  });

  it("state tidak valid → WEB_URL dan tidak connect", async () => {
    dbMock.deletedRows = [];

    const res = await call("code=rplz&state=st1");

    expect(res.headers.get("location")).toContain(`${WEB}/accounts?connect_error=`);
    expect(connectViaRepliz).not.toHaveBeenCalled();
  });

  it("organisasi & user diteruskan dari stateRow", async () => {
    dbMock.deletedRows = [stateRow({ organizationId: "org_9", userId: "user_9" })];

    await call("code=rplz&state=st1");

    expect(connectViaRepliz).toHaveBeenCalledWith({
      platform: "facebook",
      code: "rplz",
      organizationId: "org_9",
      userId: "user_9",
    });
  });
});

describe("Repliz/platform mengembalikan error", () => {
  it("diteruskan ke redirectUri developer (bukan halaman /accounts kita)", async () => {
    dbMock.selectRows = [stateRow({ developerAppId: "devapp_1", redirectUri: DEV_REDIRECT })];

    const res = await call("error=access_denied&error_description=User%20denied&state=st1");

    const location = res.headers.get("location") ?? "";
    expect(location.startsWith(`${DEV_REDIRECT}?`)).toBe(true);
    expect(location).toContain("error=access_denied");
    expect(location).toContain("error_description=User+denied");
  });

  it("jalur UI tetap diarahkan ke WEB_URL", async () => {
    dbMock.selectRows = [stateRow()];

    const res = await call("error=access_denied&error_description=User%20denied&state=st1");

    expect(res.headers.get("location")).toContain(`${WEB}/accounts?connect_error=`);
  });
});
