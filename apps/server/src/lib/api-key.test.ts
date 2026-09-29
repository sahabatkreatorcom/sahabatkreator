// Test gerbang prefix token Public API — transisi `sk_live_` → `sk_api_`.
//
// MENGAPA ini perlu diuji: `verifyApiKey` memeriksa prefix dengan `startsWith`
// SEBELUM hashing, jadi daftar prefix yang diterima adalah satu-satunya penentu
// apakah key lama masih bisa dipakai. Kalau entri legacy dihapus tanpa migrasi,
// seluruh key yang sudah beredar balas 401 — tanpa error, tanpa log, dan tanpa
// cara user tahu selain "API saya tiba-tiba mati".
//
// Tes di sini sengaja HANYA menguji gerbang prefix (bukan resolusi DB penuh):
// caranya dengan mencatat apakah query DB pernah dieksekusi.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** Berapa kali rantai select menyentuh DB. */
  selectCalls: 0,
}));

vi.mock("@sahabatkreator/db", () => ({
  db: {
    select: () => {
      state.selectCalls++;
      // Rantai kosong → verifyApiKey berhenti di `if (!row)` dan return null.
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
    },
  },
}));

vi.mock("@sahabatkreator/db/schema", () => ({
  apiKey: { tokenHash: "tokenHash", id: "id", organizationId: "organizationId" },
  user: { id: "id" },
  member: { userId: "userId", organizationId: "organizationId", role: "role" },
  organization: { id: "id" },
}));

import {
  API_KEY_LEGACY_TOKEN_PREFIXES,
  API_KEY_TOKEN_PREFIX,
  extractApiKey,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
} from "./api-key";

/** Prefix legacy pertama, dibaca dari konstanta (bukan literal di file ini —
 * literal `sk_live_` + 24 alfanumerik ditandai GitHub secret scanning). */
const LEGACY_PREFIX = API_KEY_LEGACY_TOKEN_PREFIXES[0] ?? "";

beforeEach(() => {
  state.selectCalls = 0;
});

describe("generateApiKey", () => {
  it("memakai prefix baru dan tokenPrefix yang cocok dengan plaintext", () => {
    const { plaintext, tokenPrefix } = generateApiKey();
    expect(plaintext.startsWith(API_KEY_TOKEN_PREFIX)).toBe(true);
    expect(tokenPrefix.startsWith(API_KEY_TOKEN_PREFIX)).toBe(true);
    expect(plaintext.startsWith(tokenPrefix)).toBe(true);
  });

  it("hash konsisten dengan hashApiKey (dipakai lookup DB)", () => {
    const { plaintext, tokenHash } = generateApiKey();
    expect(tokenHash).toBe(hashApiKey(plaintext));
  });
});

describe("gerbang prefix di verifyApiKey", () => {
  it("null / string kosong → null tanpa menyentuh DB", async () => {
    expect(await verifyApiKey(null)).toBeNull();
    expect(await verifyApiKey("")).toBeNull();
    expect(state.selectCalls).toBe(0);
  });

  it("prefix asing ditolak SEBELUM query DB", async () => {
    expect(await verifyApiKey("nope_abcdef")).toBeNull();
    expect(state.selectCalls).toBe(0);
  });

  it("prefix baru lolos gerbang (sampai query DB)", async () => {
    await verifyApiKey(`${API_KEY_TOKEN_PREFIX}abcdef`);
    expect(state.selectCalls).toBeGreaterThan(0);
  });

  it("prefix legacy masih lolos gerbang — key lama tidak 401", async () => {
    // Kalau tes ini gagal, entri legacy sudah dihapus tanpa migrasi key.
    expect(LEGACY_PREFIX).not.toBe("");
    expect(LEGACY_PREFIX).not.toBe(API_KEY_TOKEN_PREFIX);
    await verifyApiKey(`${LEGACY_PREFIX}abcdef`);
    expect(state.selectCalls).toBeGreaterThan(0);
  });
});

describe("extractApiKey", () => {
  it("menerima Bearer dan X-API-Key", () => {
    expect(extractApiKey(new Headers({ authorization: "Bearer tok" }))).toBe("tok");
    expect(extractApiKey(new Headers({ authorization: "bearer   tok  " }))).toBe("tok");
    expect(extractApiKey(new Headers({ "x-api-key": " tok " }))).toBe("tok");
  });

  it("null bila header tidak ada / skema bukan Bearer", () => {
    expect(extractApiKey(new Headers())).toBeNull();
    expect(extractApiKey(new Headers({ authorization: "Basic dXNlcjpwdw==" }))).toBeNull();
    expect(extractApiKey(new Headers({ "x-api-key": "   " }))).toBeNull();
  });
});
