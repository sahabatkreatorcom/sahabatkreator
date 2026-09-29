// Test builder pending picker — fungsi murni (tanpa DB). Fokus regresi:
// semua channel terbawa, token disimpan TERENKRIPSI (bukan plaintext), token
// user-level (refresh/expiry/scope) disalin ke tiap entitas seperti LinkedIn,
// dan proyeksi aset publik tidak pernah membocorkan token.
//
// Builder sengaja mengembalikan ARRAY entitas, bukan baris siap-simpan: `id`,
// TTL, dan serialisasi JSON dimiliki `createPendingSelection` supaya tidak
// diulang di setiap pemanggil. Karena itu TTL diuji lewat `pendingExpiresAt`.
import { describe, expect, it } from "vitest";
import { decrypt } from "./crypto";
import {
  buildPendingYouTube,
  OAUTH_PENDING_TTL_MS,
  pendingExpiresAt,
  toPendingAssets,
} from "./oauth-connect";

const CHANNEL_A = { id: "UC-1", title: "Channel Satu", thumbnailUrl: "https://img/1.jpg" };
const CHANNEL_B = { id: "UC-2", title: "Channel Dua", thumbnailUrl: null };
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
const EXPIRES = new Date("2026-01-02T03:04:05.000Z");

/** Entitas ke-i; gagal keras bila tidak ada (noUncheckedIndexedAccess → T | undefined). */
function entityAt(pages: Array<Record<string, unknown>>, i: number): Record<string, unknown> {
  const page = pages[i];
  if (!page) throw new Error(`entitas ke-${i} tidak ada`);
  return page;
}

describe("buildPendingYouTube", () => {
  it("satu entri per channel; token user-level disalin ke tiap entitas", () => {
    const pages = buildPendingYouTube({
      channels: [CHANNEL_A, CHANNEL_B],
      accessToken: "at-google",
      refreshToken: "rt-google",
      expiresAt: EXPIRES,
      scopes: SCOPES,
    });

    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.pageId)).toEqual(["UC-1", "UC-2"]);
    expect(pages.map((p) => p.pageName)).toEqual(["Channel Satu", "Channel Dua"]);
    expect(pages.map((p) => p.avatarUrl)).toEqual(["https://img/1.jpg", null]);

    for (const p of pages) {
      // Token TIDAK boleh tersimpan plaintext di pagesData
      expect(p.pageAccessTokenEnc).not.toBe("at-google");
      expect(decrypt(p.pageAccessTokenEnc)).toBe("at-google");
      expect(decrypt(String(p.refreshTokenEnc))).toBe("rt-google");
      expect(p.tokenExpiresAt).toBe(EXPIRES.toISOString());
      expect(p.scopes).toEqual(SCOPES);
      // YouTube bukan entitas Meta — kolom IG harus kosong
      expect(p.igUserId).toBeNull();
      expect(p.igUsername).toBeNull();
    }
  });

  it("tanpa refresh token → refreshTokenEnc null; tanpa expiresAt → tokenExpiresAt null", () => {
    const pages = buildPendingYouTube({
      channels: [CHANNEL_A],
      accessToken: "at-only",
      scopes: [],
    });

    const page = entityAt(pages, 0);
    expect(page.refreshTokenEnc).toBeNull();
    expect(page.tokenExpiresAt).toBeNull();
    expect(page.scopes).toEqual([]);
  });
});

describe("pendingExpiresAt", () => {
  it("TTL 10 menit (baris berisi token — jangan tinggal lama)", () => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    expect(pendingExpiresAt(now).getTime() - now.getTime()).toBe(OAUTH_PENDING_TTL_MS);
    expect(OAUTH_PENDING_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe("toPendingAssets", () => {
  it("hanya memaparkan id/nama/username/gambar + flag pilih — tanpa token", () => {
    const assets = toPendingAssets(
      [
        {
          pageId: "page-1",
          pageName: "Kopi Nusantara",
          pageAccessTokenEnc: "rahasia",
          igUserId: "ig-1",
          igUsername: "kopinusantara",
          avatarUrl: "https://img/a.jpg",
          refreshTokenEnc: "rahasia-rt",
        },
      ],
      "facebook",
    );

    expect(assets).toEqual([
      {
        id: "page-1",
        name: "Kopi Nusantara",
        username: "kopinusantara",
        picture: "https://img/a.jpg",
        hasInstagram: true,
        isPersonal: false,
      },
    ]);
    // Kunci apa pun yang mengandung token/rahasia tidak boleh bocor ke respons API
    expect(Object.keys(assets[0] ?? {})).toEqual([
      "id",
      "name",
      "username",
      "picture",
      "hasInstagram",
      "isPersonal",
    ]);
  });

  it("username & picture null bila entitas tidak punya (mis. channel YouTube)", () => {
    const assets = toPendingAssets(
      [
        {
          pageId: "UC-1",
          pageName: "Channel Satu",
          pageAccessTokenEnc: "x",
          igUserId: null,
          igUsername: null,
        },
      ],
      "youtube",
    );

    expect(assets[0]?.username).toBeNull();
    expect(assets[0]?.picture).toBeNull();
    expect(assets[0]?.hasInstagram).toBe(false);
  });

  it("hasInstagram menandai Page ber-IG Business (syarat bisa dipilih di flow instagram)", () => {
    const [denganIg, tanpaIg] = toPendingAssets(
      [
        {
          pageId: "p1",
          pageName: "Punya IG",
          pageAccessTokenEnc: "x",
          igUserId: "ig-9",
          igUsername: "punya",
        },
        {
          pageId: "p2",
          pageName: "Tanpa IG",
          pageAccessTokenEnc: "x",
          igUserId: null,
          igUsername: null,
        },
      ],
      "instagram",
    );

    expect(denganIg?.hasInstagram).toBe(true);
    expect(tanpaIg?.hasInstagram).toBe(false);
  });

  it("isPersonal hanya true untuk profil person LinkedIn", () => {
    const [person] = toPendingAssets(
      [
        {
          pageId: "urn:li:person:abc",
          pageName: "Budi",
          pageAccessTokenEnc: "x",
          igUserId: null,
          igUsername: null,
        },
      ],
      "linkedin",
    );
    const [organization] = toPendingAssets(
      [
        {
          pageId: "urn:li:organization:999",
          pageName: "PT Contoh",
          pageAccessTokenEnc: "x",
          igUserId: null,
          igUsername: null,
        },
      ],
      "linkedin_org",
    );
    // URN person tapi platform bukan `linkedin` → tetap false. Bentuk respons
    // ditentukan oleh platform + URN, bukan oleh pemanggil.
    const [personPlatformLain] = toPendingAssets(
      [
        {
          pageId: "urn:li:person:abc",
          pageName: "Budi",
          pageAccessTokenEnc: "x",
          igUserId: null,
          igUsername: null,
        },
      ],
      "pinterest",
    );

    expect(person?.isPersonal).toBe(true);
    expect(organization?.isPersonal).toBe(false);
    expect(personPlatformLain?.isPersonal).toBe(false);
  });
});
