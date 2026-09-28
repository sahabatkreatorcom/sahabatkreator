// Test builder pending picker YouTube — fungsi murni (tanpa DB). Fokus regresi:
// semua channel terbawa, token disimpan TERENKRIPSI (bukan plaintext), dan token
// user-level (refresh/expiry/scope) disalin ke tiap entitas seperti LinkedIn.
import { describe, expect, it } from "vitest";
import { decrypt } from "./crypto";
import { buildPendingYouTube, OAUTH_PENDING_TTL_MS } from "./oauth-connect";

const CHANNEL_A = { id: "UC-1", title: "Channel Satu", thumbnailUrl: "https://img/1.jpg" };
const CHANNEL_B = { id: "UC-2", title: "Channel Dua", thumbnailUrl: null };
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
const EXPIRES = new Date("2026-01-02T03:04:05.000Z");

function parsePages(pagesData: string): Array<Record<string, unknown>> {
  return JSON.parse(pagesData) as Array<Record<string, unknown>>;
}

/** Entitas ke-i; gagal keras bila tidak ada (noUncheckedIndexedAccess → T | undefined). */
function entityAt(pagesData: string, i: number): Record<string, unknown> {
  const page = parsePages(pagesData)[i];
  if (!page) throw new Error(`entitas ke-${i} tidak ada di pagesData`);
  return page;
}

describe("buildPendingYouTube", () => {
  it("satu entri per channel; token user-level disalin ke tiap entitas", () => {
    const pending = buildPendingYouTube({
      channels: [CHANNEL_A, CHANNEL_B],
      accessToken: "at-google",
      refreshToken: "rt-google",
      expiresAt: EXPIRES,
      scopes: SCOPES,
    });

    expect(pending.platform).toBe("youtube");
    expect(pending.id.startsWith("sk_oauthpend_")).toBe(true);

    const pages = parsePages(pending.pagesData);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.pageId)).toEqual(["UC-1", "UC-2"]);
    expect(pages.map((p) => p.pageName)).toEqual(["Channel Satu", "Channel Dua"]);
    expect(pages.map((p) => p.avatarUrl)).toEqual(["https://img/1.jpg", null]);

    for (const p of pages) {
      // Token TIDAK boleh tersimpan plaintext di pagesData
      expect(p.pageAccessTokenEnc).not.toBe("at-google");
      expect(decrypt(String(p.pageAccessTokenEnc))).toBe("at-google");
      expect(decrypt(String(p.refreshTokenEnc))).toBe("rt-google");
      expect(p.tokenExpiresAt).toBe(EXPIRES.toISOString());
      expect(p.scopes).toEqual(SCOPES);
      // YouTube bukan entitas Meta — kolom IG harus kosong
      expect(p.igUserId).toBeNull();
      expect(p.igUsername).toBeNull();
    }
  });

  it("tanpa refresh token → refreshTokenEnc null; tanpa expiresAt → tokenExpiresAt null", () => {
    const pending = buildPendingYouTube({
      channels: [CHANNEL_A],
      accessToken: "at-only",
      scopes: [],
    });

    const page = entityAt(pending.pagesData, 0);
    expect(page.refreshTokenEnc).toBeNull();
    expect(page.tokenExpiresAt).toBeNull();
    expect(page.scopes).toEqual([]);
  });

  it("TTL pending 10 menit (berisi token — jangan tinggal lama)", () => {
    const before = Date.now();
    const pending = buildPendingYouTube({ channels: [CHANNEL_A], accessToken: "a", scopes: [] });
    const delta = pending.expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(OAUTH_PENDING_TTL_MS - 1_000);
    expect(delta).toBeLessThan(OAUTH_PENDING_TTL_MS + 1_000);
  });
});
