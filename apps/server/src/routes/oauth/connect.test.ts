// Test matriks routing `connectWithCode` + kuota connect (RFC rfc-oauth-connect.md §9).
//
// MENGAPA file ini terpisah dari `accounts-connect.test.ts`: di sana
// `connectWithCode` di-MOCK, jadi kontrak HTTP-nya terjaga tapi keputusan
// native-vs-bridge dan pemetaan platform → pending/accountId tidak pernah
// dieksekusi. Di sini orkestrator ASLI yang berjalan — hanya batas sistem yang
// di-mock (HTTP platform, API Repliz, DB, gate paket).
//
// Yang dijaga:
//   1. Native vs bridge diputuskan dari `isReplizRouted`, dan jalur yang tidak
//      dipakai benar-benar tidak disentuh (exchange native vs API Repliz).
//   2. Bentuk aset pending KANONIK — `hasInstagram`/`isPersonal` ikut terisi,
//      karena tanpa itu developer tidak tahu aset mana yang bisa dipilih
//      (RFC §11 #7).
//   3. Gate kuota `social_accounts` HANYA di cabang akun baru; reconnect saat
//      pool di plafon tetap sukses (§5.7).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPError } from "../../lib/auth-guard";
import type { BuildPendingResult } from "../../lib/oauth-connect";

const mocks = vi.hoisted(() => ({
  isReplizRouted: vi.fn(),
  getReplizCredentials: vi.fn(),
  toReplizPlatformKey: vi.fn(),
  getAppCredential: vi.fn(),
  isOAuthPlatformSupported: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  fetchPlatformProfile: vi.fn(),
  replizConnectAccount: vi.fn(),
  replizExchangeCode: vi.fn(),
  replizGetAccount: vi.fn(),
  replizGetFacebookPages: vi.fn(),
  replizGetYouTubeChannels: vi.fn(),
  replizGetLinkedInOrganizations: vi.fn(),
  checkFeatureGate: vi.fn(),
  fireActivity: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  inserts: [] as unknown[],
}));

vi.mock("@sahabatkreator/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(dbMock.selectRows) }) }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        dbMock.inserts.push(v);
        return Promise.resolve();
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));

vi.mock("@sahabatkreator/publishing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sahabatkreator/publishing")>();
  return {
    ...actual,
    isOAuthPlatformSupported: mocks.isOAuthPlatformSupported,
    exchangeCodeForToken: mocks.exchangeCodeForToken,
    fetchPlatformProfile: mocks.fetchPlatformProfile,
    replizConnectAccount: mocks.replizConnectAccount,
    replizExchangeCode: mocks.replizExchangeCode,
    replizGetAccount: mocks.replizGetAccount,
    replizGetFacebookPages: mocks.replizGetFacebookPages,
    replizGetYouTubeChannels: mocks.replizGetYouTubeChannels,
    replizGetLinkedInOrganizations: mocks.replizGetLinkedInOrganizations,
  };
});

vi.mock("../../lib/bridge", () => ({
  isReplizRouted: mocks.isReplizRouted,
  getReplizCredentials: mocks.getReplizCredentials,
  toReplizPlatformKey: mocks.toReplizPlatformKey,
}));

vi.mock("../../lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/billing")>();
  return { ...actual, checkFeatureGate: mocks.checkFeatureGate };
});

vi.mock("../../lib/activity-log", () => ({ fireActivity: mocks.fireActivity }));

vi.mock("./credentials", () => ({ getAppCredential: mocks.getAppCredential }));

const { connectWithCode } = await import("./connect");

const CTX = { organizationId: "org_1", userId: "user_1" };

/** Token hasil exchange — bentuk `TokenResult`. */
const TOKEN = { accessToken: "tok", refreshToken: null, expiresAt: null, scopes: ["s"] };

/** Satu akun Repliz — bentuk `ReplizAccount`. */
function replizAccount(over: Record<string, unknown> = {}) {
  return {
    id: "repliz_1",
    generatedId: "gen_1",
    name: "Akun Repliz",
    username: "akunrepliz",
    isConnected: true,
    type: "tiktok",
    ...over,
  };
}

/** Persempit hasil ke daftar aset; gagal keras bila bukan `pending`. */
function assetsOf(result: BuildPendingResult) {
  if (result.kind !== "pending") throw new Error(`diharapkan pending, dapat: ${result.kind}`);
  return result.assets;
}

/** Siapkan jalur native: kredensial app + token + profil. */
function primeNative(profile: Record<string, unknown>) {
  mocks.getAppCredential.mockResolvedValue({ clientId: "c", clientSecret: "s" });
  mocks.exchangeCodeForToken.mockResolvedValue(TOKEN);
  mocks.fetchPlatformProfile.mockResolvedValue({
    platformAccountId: "acc_1",
    username: "akun",
    displayName: "Akun",
    avatarUrl: null,
    ...profile,
  });
}

/** Siapkan jalur bridge: kredensial Repliz aktif. */
function primeBridge(platformKey = "tiktok") {
  mocks.isReplizRouted.mockResolvedValue(true);
  mocks.getReplizCredentials.mockResolvedValue({ apiKey: "k" });
  mocks.toReplizPlatformKey.mockReturnValue(platformKey);
}

beforeEach(() => {
  dbMock.selectRows = [];
  dbMock.inserts = [];
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.isOAuthPlatformSupported.mockReturnValue(true);
  mocks.isReplizRouted.mockResolvedValue(false);
  mocks.checkFeatureGate.mockResolvedValue(undefined);
  mocks.fireActivity.mockReturnValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("connectWithCode — routing native vs bridge", () => {
  it("platform tidak didukung → error, tanpa menyentuh routing maupun platform", async () => {
    mocks.isOAuthPlatformSupported.mockReturnValue(false);

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result.kind).toBe("error");
    expect(mocks.isReplizRouted).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("native + satu entitas → connected (tanpa pending)", async () => {
    primeNative({ extra: null });
    dbMock.selectRows = []; // belum ada akun

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result).toMatchObject({ kind: "connected" });
    expect(mocks.exchangeCodeForToken).toHaveBeenCalledWith("tiktok", expect.anything(), "abc");
    expect(mocks.replizConnectAccount).not.toHaveBeenCalled();
  });

  it("native + Page Meta ganda → pending, dengan bentuk aset kanonik", async () => {
    primeNative({
      extra: {
        pages: [
          {
            id: "page_1",
            name: "Page Satu",
            access_token: "t1",
            instagram_business_account: { id: "ig_1", username: "igsatu" },
          },
          { id: "page_2", name: "Page Dua", access_token: "t2" },
        ],
      },
    });

    const result = await connectWithCode({ platform: "facebook", code: "abc", ...CTX });

    const assets = assetsOf(result);
    expect(assets).toHaveLength(2);
    // Bentuk LENGKAP — inilah kontrak yang juga dipakai GET /pending/:id (§11 #7).
    expect(assets[0]).toEqual({
      id: "page_1",
      name: "Page Satu",
      username: "igsatu",
      picture: null,
      hasInstagram: true,
      isPersonal: false,
    });
    // Page tanpa IG Business: tidak bisa dipilih di flow instagram → flag false.
    expect(assets[1]).toMatchObject({ id: "page_2", hasInstagram: false });
    expect(dbMock.inserts[0]).toMatchObject({ platform: "facebook" });
  });

  it("bridge + platform code-only → connected lewat Repliz tanpa exchange native", async () => {
    primeBridge("tiktok");
    mocks.replizConnectAccount.mockResolvedValue("repliz_acc_1");
    mocks.replizGetAccount.mockResolvedValue(replizAccount());

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result).toMatchObject({ kind: "connected" });
    expect(mocks.replizConnectAccount).toHaveBeenCalled();
    expect(mocks.replizExchangeCode).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForToken).not.toHaveBeenCalled();
    expect(mocks.fetchPlatformProfile).not.toHaveBeenCalled();
  });

  it("bridge + platform picker → pending dari entitas Repliz", async () => {
    primeBridge("facebook");
    mocks.replizExchangeCode.mockResolvedValue("token_repliz");
    mocks.replizGetFacebookPages.mockResolvedValue([
      { id: "fb_1", name: "Page Satu", username: "igsatu", token: "rt1" },
    ]);

    const result = await connectWithCode({ platform: "facebook", code: "abc", ...CTX });

    expect(assetsOf(result)).toEqual([
      {
        id: "fb_1",
        name: "Page Satu",
        username: "igsatu",
        picture: null,
        // Bridge tidak melaporkan IG tertaut per Page → false, bukan menebak.
        hasInstagram: false,
        isPersonal: false,
      },
    ]);
    expect(mocks.replizConnectAccount).not.toHaveBeenCalled();
    expect(mocks.fetchPlatformProfile).not.toHaveBeenCalled();
  });

  it("bridge + linkedin menyaring person, linkedin_org menyaring organization", async () => {
    primeBridge("linkedin");
    mocks.replizExchangeCode.mockResolvedValue("token_repliz");
    mocks.replizGetLinkedInOrganizations.mockResolvedValue([
      { id: "urn:li:person:abc", name: "Budi", token: "rt" },
      { id: "urn:li:organization:999", name: "PT Contoh", token: "rt" },
    ]);

    const person = await connectWithCode({ platform: "linkedin", code: "abc", ...CTX });

    expect(assetsOf(person).map((a) => a.id)).toEqual(["urn:li:person:abc"]);
    // `isPersonal` konsisten antara jalur native dan bridge.
    expect(assetsOf(person)[0]?.isPersonal).toBe(true);

    dbMock.inserts = [];
    const org = await connectWithCode({ platform: "linkedin_org", code: "abc", ...CTX });

    expect(assetsOf(org).map((a) => a.id)).toEqual(["urn:li:organization:999"]);
    expect(assetsOf(org)[0]?.isPersonal).toBe(false);
  });

  it("bridge + picker tanpa entitas → error dengan pesan platform", async () => {
    primeBridge("facebook");
    mocks.replizExchangeCode.mockResolvedValue("token_repliz");
    mocks.replizGetFacebookPages.mockResolvedValue([]);

    const result = await connectWithCode({ platform: "facebook", code: "abc", ...CTX });

    expect(result).toMatchObject({ kind: "error" });
    expect((result as { message: string }).message).toContain("Facebook Page");
  });

  it("bridge di-routing tapi kredensial Repliz tidak ada → error, bukan crash", async () => {
    mocks.isReplizRouted.mockResolvedValue(true);
    mocks.getReplizCredentials.mockResolvedValue(null);

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result).toMatchObject({ kind: "error" });
    expect((result as { message: string }).message).toContain("Bridge Repliz tidak aktif");
  });
});

describe("kuota connect — gate hanya di cabang akun BARU (§5.7)", () => {
  it("akun baru saat pool di plafon → gate dipanggil dan 402 diteruskan", async () => {
    primeNative({ extra: null });
    mocks.checkFeatureGate.mockRejectedValue(new HTTPError(402, "Limit akun tercapai"));
    dbMock.selectRows = [];

    await expect(connectWithCode({ platform: "tiktok", code: "abc", ...CTX })).rejects.toThrow(
      "Limit akun tercapai",
    );
    expect(mocks.checkFeatureGate).toHaveBeenCalledWith("org_1", "social_accounts");
    // Tidak ada akun yang ter-insert saat gate menolak.
    expect(dbMock.inserts).toHaveLength(0);
  });

  it("reconnect akun native yang sudah ada saat plafon → sukses, gate TIDAK dipanggil", async () => {
    primeNative({ extra: null });
    mocks.checkFeatureGate.mockRejectedValue(new HTTPError(402, "Limit akun tercapai"));
    dbMock.selectRows = [{ id: "socacc_1", organizationId: "org_1" }];

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result).toEqual({ kind: "connected", accountId: "socacc_1" });
    expect(mocks.checkFeatureGate).not.toHaveBeenCalled();
  });

  it("reconnect akun bridge yang sudah ada saat plafon → sukses, gate TIDAK dipanggil", async () => {
    primeBridge("tiktok");
    mocks.replizConnectAccount.mockResolvedValue("repliz_acc_1");
    mocks.replizGetAccount.mockResolvedValue(replizAccount());
    mocks.checkFeatureGate.mockRejectedValue(new HTTPError(402, "Limit akun tercapai"));
    dbMock.selectRows = [{ id: "socacc_9", organizationId: "org_1" }];

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result).toEqual({ kind: "connected", accountId: "socacc_9" });
    expect(mocks.checkFeatureGate).not.toHaveBeenCalled();
  });

  it("akun sudah milik org LAIN saat plafon → conflict, bukan 402", async () => {
    primeNative({ extra: null });
    dbMock.selectRows = [{ id: "socacc_2", organizationId: "org_2" }];

    const result = await connectWithCode({ platform: "tiktok", code: "abc", ...CTX });

    expect(result).toEqual({ kind: "conflict" });
    expect(mocks.checkFeatureGate).not.toHaveBeenCalled();
  });
});
