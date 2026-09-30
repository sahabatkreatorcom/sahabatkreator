// Test parsing signed_request — protokol Data Deletion Request Callback Meta.
//
// Regresi nyata (1 Okt 2026): deteksi bentuk body memakai regex pada ISI body,
// bukan pada header Content-Type. Akibatnya body form-urlencoded
// `signed_request=abc.def` (BENTUK RESMI YANG DIKIRIM META) tidak dikenali,
// jatuh ke JSON.parse yang melempar, dan endpoint balas 400
// "signed_request wajib ada" — padahal Meta mengirim dengan benar.
// Callback data deletion gagal = App Review ditolak.
//
// Test ini mengunci ketiga bentuk body (form-urlencoded, JSON, raw) supaya
// tidak ada lagi bentuk yang lolos.

import { describe, expect, it } from "vitest";
import { extractSignedRequest } from "./data-deletion";

const SR = "c2lnbmF0dXJlLXBhbGFuZw.cGF5bG9hZA";

describe("extractSignedRequest — bentuk body protokol Meta", () => {
  it("form-urlencoded (bentuk RESMI Meta)", () => {
    expect(extractSignedRequest(`signed_request=${SR}`)).toBe(SR);
  });

  it("form-urlencoded dengan nilai URL-encoded", () => {
    expect(extractSignedRequest(`signed_request=${encodeURIComponent(SR)}`)).toBe(SR);
  });

  it("form-urlencoded bersama parameter lain", () => {
    expect(extractSignedRequest(`foo=bar&signed_request=${SR}&baz=1`)).toBe(SR);
  });

  it("JSON body", () => {
    expect(extractSignedRequest(JSON.stringify({ signed_request: SR }))).toBe(SR);
  });

  it("string mentah tanpa prefix", () => {
    expect(extractSignedRequest(SR)).toBe(SR);
  });

  it("toleran spasi / newline di ujung", () => {
    expect(extractSignedRequest(`  signed_request=${SR}\n`)).toBe(SR);
  });
});

describe("extractSignedRequest — input tidak valid harus undefined", () => {
  it("body kosong", () => {
    expect(extractSignedRequest("")).toBeUndefined();
    expect(extractSignedRequest("   ")).toBeUndefined();
  });

  it("form-urlencoded tanpa signed_request", () => {
    expect(extractSignedRequest("foo=bar&baz=1")).toBeUndefined();
  });

  it("signed_request bernilai kosong", () => {
    expect(extractSignedRequest("signed_request=")).toBeUndefined();
  });

  it("JSON tanpa signed_request", () => {
    expect(extractSignedRequest(JSON.stringify({ other: 1 }))).toBeUndefined();
  });

  it("JSON rusak", () => {
    expect(extractSignedRequest("{ signed_request: ")).toBeUndefined();
  });

  it("teks bebas tanpa titik pemisah", () => {
    expect(extractSignedRequest("hello world")).toBeUndefined();
  });
});
