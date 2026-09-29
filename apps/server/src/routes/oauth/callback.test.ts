// Test cabang proxy di callback OAuth (RFC rfc-oauth-connect.md §5.3).
//
// Ini inti fase 2: memastikan SK berhenti jadi pemilik flow saat state berasal
// dari jalur API, dan — yang paling mudah rusak — jalur UI tidak ikut berubah.
//
// Hanya `db` yang di-mock (satu rantai delete + satu rantai select). Proxy tidak
// memanggil platform sama sekali, jadi tidak perlu mock jaringan; `publishing`
// di-mock hanya supaya jalur UI gagal secara deterministik tanpa fetch nyata.
import { env } from "@sahabatkreator/env/server";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  deletedRows: [] as unknown[],
  selectRows: [] as unknown[],
  deleteCalls: 0,
}));

vi.mock("@sahabatkreator/db", () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: () => {
          dbMock.deleteCalls += 1;
          return Promise.resolve(dbMock.deletedRows);
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(dbMock.selectRows) }),
      }),
    }),
  },
}));

const exchangeCodeForToken = vi.hoisted(() => vi.fn());
const fetchPlatformProfile = vi.hoisted(() => vi.fn());

vi.mock("@sahabatkreator/publishing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sahabatkreator/publishing")>();
  return {
    ...actual,
    // Jalur UI sengaja gagal di sini: test ini tidak menguji connect, hanya
    // membuktikan jalur UI TIDAK memakai redirectUri milik developer.
    exchangeCodeForToken: exchangeCodeForToken.mockRejectedValue(new Error("stop di exchange")),
    fetchPlatformProfile,
  };
});

// Kredensial app di-stub supaya jalur UI benar-benar sampai ke exchange platform
// (kalau tidak, ia gagal lebih awal dan test tidak membuktikan apa pun tentang
// perbedaan jalur).
vi.mock("./credentials", () => ({
  getAppCredential: vi.fn(async () => ({
    clientId: "client",
    clientSecret: "secret",
    redirectUri: "https://sk.example.com/api/oauth/tiktok/callback",
  })),
}));

const { handleCallback } = await import("./callback");

const app = new Hono();
app.get("/oauth/:platform/callback", handleCallback);

const DEV_REDIRECT = "https://dev.example.com/cb";

function stateRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ost_1",
    state: "st1",
    platform: "tiktok",
    organizationId: "org_1",
    userId: "user_1",
    developerAppId: null,
    redirectUri: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

async function call(query: string): Promise<Response> {
  return app.request(`/oauth/tiktok/callback?${query}`);
}

beforeEach(() => {
  dbMock.deletedRows = [];
  dbMock.selectRows = [];
  dbMock.deleteCalls = 0;
  exchangeCodeForToken.mockClear();
  fetchPlatformProfile.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("callback jalur API (stateRow.developerAppId terisi)", () => {
  it("302 ke redirectUri developer dengan code & state, tanpa menyentuh platform", async () => {
    dbMock.deletedRows = [stateRow({ developerAppId: "devapp_1", redirectUri: DEV_REDIRECT })];

    const res = await call("code=abc&state=st1");

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBe(`${DEV_REDIRECT}?code=abc&state=st1`);
    // Bukti SK tidak melakukan exchange apa pun di jalur ini
    expect(exchangeCodeForToken).not.toHaveBeenCalled();
    expect(fetchPlatformProfile).not.toHaveBeenCalled();
  });

  it("redirectUri yang sudah punya query string tidak dirusak", async () => {
    // Konkatenasi naif (`${uri}?code=…`) menghasilkan `?lang=id?code=…` — URL
    // rusak dan developer tidak pernah menerima code.
    dbMock.deletedRows = [
      stateRow({ developerAppId: "devapp_1", redirectUri: `${DEV_REDIRECT}?lang=id` }),
    ];

    const res = await call("code=abc&state=st1");

    expect(res.headers.get("location")).toBe(`${DEV_REDIRECT}?lang=id&code=abc&state=st1`);
  });

  it("state ditandai API tapi tanpa redirectUri → kembali ke WEB_URL, bukan 500", async () => {
    dbMock.deletedRows = [stateRow({ developerAppId: "devapp_1", redirectUri: null })];

    const res = await call("code=abc&state=st1");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(`${env.WEB_URL}/accounts?connect_error=`);
  });
});

describe("callback jalur UI (regresi)", () => {
  it("stateRow tanpa developerAppId TIDAK pernah memakai redirectUri developer", async () => {
    // Pertahanan ganda: walaupun redirectUri terisi (mis. sisa data lama),
    // jalur UI harus tetap berakhir di halaman /accounts kita sendiri.
    dbMock.deletedRows = [stateRow({ developerAppId: null, redirectUri: DEV_REDIRECT })];

    const res = await call("code=abc&state=st1");

    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location.startsWith(`${env.WEB_URL}/accounts`)).toBe(true);
    expect(location).not.toContain("dev.example.com");
    // Jalur UI memang memakai platform (beda dari jalur proxy)
    expect(exchangeCodeForToken).toHaveBeenCalled();
  });

  it("state tidak valid → WEB_URL, dan redirectUri developer tidak dipakai", async () => {
    dbMock.deletedRows = [];

    const res = await call("code=abc&state=st1");

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(`${env.WEB_URL}/accounts?connect_error=`);
  });

  it("state kedaluwarsa → WEB_URL", async () => {
    dbMock.deletedRows = [stateRow({ expiresAt: new Date(Date.now() - 1_000) })];

    const res = await call("code=abc&state=st1");

    expect(res.headers.get("location")).toContain("kedaluwarsa");
  });
});

describe("platform mengembalikan error", () => {
  it("diteruskan ke redirectUri developer (bukan halaman /accounts kita)", async () => {
    // Kalau error tidak sampai ke developer, UI-nya menggantung menunggu
    // callback yang tidak pernah datang.
    dbMock.selectRows = [stateRow({ developerAppId: "devapp_1", redirectUri: DEV_REDIRECT })];

    const res = await call("error=access_denied&error_description=User%20denied&state=st1");

    const location = res.headers.get("location") ?? "";
    expect(location.startsWith(`${DEV_REDIRECT}?`)).toBe(true);
    expect(location).toContain("error=access_denied");
    expect(location).toContain("error_description=User+denied");
  });

  it("jalur UI tetap diarahkan ke WEB_URL (perilaku lama tidak berubah)", async () => {
    dbMock.selectRows = [stateRow({ developerAppId: null, redirectUri: null })];

    const res = await call("error=access_denied&error_description=User%20denied");

    expect(res.headers.get("location")).toContain(`${env.WEB_URL}/accounts?connect_error=`);
  });
});
