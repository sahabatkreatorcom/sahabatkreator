// Test crypto.ts — kontrak enkripsi kredensial + alur rotasi dual-key.
//
// Yang diuji: (1) roundtrip biasa, (2) decrypt menerima ciphertext era key
// lama via ENCRYPTION_KEY_OLD (inilah yang membuat rotasi tanpa downtime),
// (3) encrypt SELALU pakai key utama (tulisan baru tidak pernah memakai key
// lama), (4) kegagalan total dilaporkan jelas — bukan diam-diam return null.
//
// Mengapa penting: kredensial 12 platform + webhook secret + api key billing
// semua lewat fungsi ini. Bug decrypt = semua akun terputus sekaligus; bug
// encrypt = data sensitif tidak terlindungi.

import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

let savedKey: string | undefined;
let savedOldKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.ENCRYPTION_KEY;
  savedOldKey = process.env.ENCRYPTION_KEY_OLD;
  delete process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY_OLD;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = savedKey;
  if (savedOldKey === undefined) delete process.env.ENCRYPTION_KEY_OLD;
  else process.env.ENCRYPTION_KEY_OLD = savedOldKey;
});

describe("crypto — roundtrip dasar", () => {
  it("encrypt lalu decrypt mengembalikan plaintext asli", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const payload = encrypt("token_rahasia_abc");

    expect(payload.startsWith("v1.")).toBe(true);
    expect(decrypt(payload)).toBe("token_rahasia_abc");
  });

  it("payload unik per encrypt (IV random) — plaintext sama, ciphertext beda", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const a = encrypt("sama");
    const b = encrypt("sama");

    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("sama");
    expect(decrypt(b)).toBe("sama");
  });

  it("ENCRYPTION_KEY belum diset → encrypt throw (fail loud, bukan plaintext)", () => {
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("ENCRYPTION_KEY bukan 32-byte → throw", () => {
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => encrypt("x")).toThrow(/32-byte/);
  });
});

describe("crypto — rotasi dual-key (zero-downtime)", () => {
  it("decrypt menerima ciphertext era key lama via ENCRYPTION_KEY_OLD", () => {
    // Simulasi window rotasi: DB masih simpan ciphertext key lama, service
    // sudah pakai key baru. Fallback decrypt menjamin request tetap jalan.
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_OLD = KEY_A;
    const legacyPayload = (() => {
      process.env.ENCRYPTION_KEY = KEY_A;
      const p = encrypt("token_lama");
      process.env.ENCRYPTION_KEY = KEY_B;
      return p;
    })();

    expect(decrypt(legacyPayload)).toBe("token_lama");
  });

  it("ciphertext key baru tidak butuh ENCRYPTION_KEY_OLD", () => {
    // Setelah re-encrypt selesai, ENCRYPTION_KEY_OLD dihapus. Semua row
    // key-baru harus tetap decryptable — fallback tidak boleh jadi dependensi.
    process.env.ENCRYPTION_KEY = KEY_B;
    const freshPayload = encrypt("token_baru");
    delete process.env.ENCRYPTION_KEY;

    process.env.ENCRYPTION_KEY = KEY_B;
    expect(decrypt(freshPayload)).toBe("token_baru");
  });

  it("encrypt selalu pakai key utama — ENCRYPTION_KEY_OLD tidak pernah dipakai tulis", () => {
    process.env.ENCRYPTION_KEY = KEY_B;
    process.env.ENCRYPTION_KEY_OLD = KEY_A;
    const payload = encrypt("baru saja");

    // Decrypt HANYA dengan key utama berhasil; key lama tidak bisa (buktinya
    // tulisan tidak pernah memakai key lama — kalau iya, fallback terjadi).
    process.env.ENCRYPTION_KEY = KEY_B;
    delete process.env.ENCRYPTION_KEY_OLD;
    expect(decrypt(payload)).toBe("baru saja");

    process.env.ENCRYPTION_KEY = KEY_A;
    expect(() => decrypt(payload)).toThrow();
  });

  it("tidak ada key yang cocok (tanpa OLD) → throw, bukan return nilai asing", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    const fromUnknownKey = (() => {
      process.env.ENCRYPTION_KEY = KEY_B;
      const p = encrypt("bukan milik A");
      process.env.ENCRYPTION_KEY = KEY_A;
      return p;
    })();

    expect(() => decrypt(fromUnknownKey)).toThrow();
  });

  it("ada ENCRYPTION_KEY_OLD tapi tetap tidak cocok → throw (error key ketiga/korup)", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    process.env.ENCRYPTION_KEY_OLD = KEY_B;
    const fromThirdKey = (() => {
      process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
      const p = encrypt("key ketiga");
      process.env.ENCRYPTION_KEY = KEY_A;
      return p;
    })();

    expect(() => decrypt(fromThirdKey)).toThrow();
  });

  it("format payload rusak → throw, walau key benar", () => {
    process.env.ENCRYPTION_KEY = KEY_A;
    process.env.ENCRYPTION_KEY_OLD = KEY_B;

    expect(() => decrypt("v1.garbage")).toThrow(/Format ciphertext tidak valid/);
    expect(() => decrypt("plain-text")).toThrow(/Format ciphertext tidak valid/);
  });
});
