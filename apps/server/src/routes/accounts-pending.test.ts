// Test isolasi organisasi di endpoint pending picker (RFC §7 & §11 #1).
//
// Dua hal yang dijaga:
//   1. Pending milik organisasi LAIN tidak bisa dibaca maupun dipilih.
//   2. Pending milik organisasi yang SAMA boleh diselesaikan anggota mana pun —
//      inilah perbaikan §11 #1: sebelumnya cek `row.userId !== ctx.user.id`
//      membuat alur picker putus begitu API key dirotasi atau pembuatnya keluar
//      dari org.
//
// Sekaligus mengunci urutan cabang: cek organisasi HARUS sebelum cabang
// kedaluwarsa, karena cabang itu menghapus baris.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  deleteCalls: 0,
}));

const ctxMock = vi.hoisted(() => ({
  organizationId: "org_1",
  userId: "user_2",
}));

const upsertSocialAccount = vi.hoisted(() => vi.fn());

vi.mock("@sahabatkreator/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(dbMock.selectRows) }) }),
    }),
    delete: () => ({
      where: () => {
        dbMock.deleteCalls += 1;
        return Promise.resolve();
      },
    }),
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));

vi.mock("../lib/auth-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth-guard")>();
  return {
    ...actual,
    requireOrg: async () => ({
      user: { id: ctxMock.userId, name: "Uji", email: "uji@example.com" },
      sessionId: "sess_1",
      organization: { id: ctxMock.organizationId, role: "member", name: "Org" },
    }),
  };
});

vi.mock("../lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/billing")>();
  return { ...actual, checkFeatureGate: vi.fn(), checkPlanFeature: vi.fn() };
});

vi.mock("../lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/crypto")>();
  return { ...actual, decrypt: () => "plain-token" };
});

vi.mock("../lib/activity-log", () => ({ fireActivity: vi.fn() }));

vi.mock("../lib/oauth-connect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/oauth-connect")>();
  return { ...actual, upsertSocialAccount };
});

const { accountsRoute } = await import("./accounts");

const app = new Hono();
app.route("/accounts", accountsRoute);

const PAGES_DATA = JSON.stringify([
  {
    pageId: "page_1",
    pageName: "Page Satu",
    pageAccessTokenEnc: "enc",
    igUserId: "ig_1",
    igUsername: "igsatu",
    avatarUrl: null,
  },
]);

/** Baris pending; `userId` sengaja BUKAN ctx.user.id (flow dimulai orang lain). */
function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pend_1",
    userId: "user_1",
    organizationId: "org_1",
    platform: "instagram",
    pagesData: PAGES_DATA,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    ...overrides,
  };
}

function get(id = "pend_1") {
  return app.request(`/accounts/pending/${id}`);
}

function select(id = "pend_1", body: unknown = { assetId: "page_1" }) {
  return app.request(`/accounts/pending/${id}/select`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  dbMock.selectRows = [];
  dbMock.deleteCalls = 0;
  ctxMock.organizationId = "org_1";
  ctxMock.userId = "user_2";
  upsertSocialAccount.mockReset();
  upsertSocialAccount.mockResolvedValue({
    conflict: false,
    existing: false,
    accountId: "socacc_1",
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /accounts/pending/:id", () => {
  it("anggota LAIN di organisasi yang sama boleh membaca daftar aset", async () => {
    // Inti perbaikan §11 #1: row.userId (user_1) ≠ ctx.user.id (user_2).
    dbMock.selectRows = [pendingRow()];

    const res = await get();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { platform: string; assets: Array<Record<string, unknown>> };
    expect(body.platform).toBe("instagram");
    // Bentuk aset harus SAMA dengan `assets[]` di respons POST /connect (RFC §11 #7):
    // satu proyeksi `toPendingAssets`, bukan pemetaan kedua di route ini.
    expect(body.assets).toEqual([
      {
        id: "page_1",
        name: "Page Satu",
        username: "igsatu",
        picture: null,
        hasInstagram: true,
        isPersonal: false,
      },
    ]);
  });

  it("profil person LinkedIn ditandai isPersonal lewat jalur pending", async () => {
    dbMock.selectRows = [
      pendingRow({
        platform: "linkedin",
        pagesData: JSON.stringify([
          {
            pageId: "urn:li:person:abc",
            pageName: "Budi",
            pageAccessTokenEnc: "enc",
            igUserId: null,
            igUsername: null,
          },
        ]),
      }),
    ];

    const body = (await (await get()).json()) as { assets: Array<{ isPersonal: boolean }> };

    expect(body.assets[0]?.isPersonal).toBe(true);
  });

  it("pending milik organisasi lain → 403", async () => {
    dbMock.selectRows = [pendingRow({ organizationId: "org_2" })];

    const res = await get();

    expect(res.status).toBe(403);
  });

  it("pending tidak ada → 404", async () => {
    dbMock.selectRows = [];

    const res = await get("pend_tidak_ada");

    expect(res.status).toBe(404);
  });

  it("kedaluwarsa → 410 dan barisnya dihapus", async () => {
    dbMock.selectRows = [pendingRow({ expiresAt: new Date(Date.now() - 1_000) })];

    const res = await get();

    expect(res.status).toBe(410);
    expect(dbMock.deleteCalls).toBe(1);
  });

  it("kedaluwarsa MILIK ORG LAIN → 403 dan TIDAK menghapus barisnya", async () => {
    // Urutan cabang: kalau kedaluwarsa dicek lebih dulu, org lain bisa menghapus
    // pending kita hanya dengan menebak ID-nya.
    dbMock.selectRows = [
      pendingRow({ organizationId: "org_2", expiresAt: new Date(Date.now() - 1_000) }),
    ];

    const res = await get();

    expect(res.status).toBe(403);
    expect(dbMock.deleteCalls).toBe(0);
  });
});

describe("POST /accounts/pending/:id/select", () => {
  it("anggota LAIN di organisasi yang sama boleh menyelesaikan connect", async () => {
    dbMock.selectRows = [pendingRow()];

    const res = await select();

    expect(res.status).toBe(200);
    // Akun masuk ke org dari KONTEKS AUTH — bukan org/user pembuat pending.
    expect(upsertSocialAccount).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1", platform: "instagram" }),
    );
  });

  it("body lama `{ pageId }` ditolak — field-nya sekarang `assetId`", async () => {
    // Kontrak §11 #7: nilai yang dibaca dari `assets[].id` dikirim balik sebagai
    // `assetId`, supaya kosakata baca dan tulis sama (aset bisa board/channel/
    // profil, bukan hanya Page). `pageId` lama harus gagal, bukan diam-diam jalan.
    dbMock.selectRows = [pendingRow()];

    const res = await select("pend_1", { pageId: "page_1" });

    expect(res.status).toBe(400);
    expect(upsertSocialAccount).not.toHaveBeenCalled();
  });

  it("pending milik organisasi lain → 403, tanpa connect & tanpa hapus", async () => {
    dbMock.selectRows = [pendingRow({ organizationId: "org_2" })];

    const res = await select();

    expect(res.status).toBe(403);
    expect(upsertSocialAccount).not.toHaveBeenCalled();
    expect(dbMock.deleteCalls).toBe(0);
  });

  it("kedaluwarsa MILIK ORG LAIN → 403, bukan 410, dan tidak menghapus", async () => {
    dbMock.selectRows = [
      pendingRow({ organizationId: "org_2", expiresAt: new Date(Date.now() - 1_000) }),
    ];

    const res = await select();

    expect(res.status).toBe(403);
    expect(dbMock.deleteCalls).toBe(0);
  });
});
