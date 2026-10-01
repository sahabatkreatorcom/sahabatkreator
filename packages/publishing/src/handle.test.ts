import { describe, expect, it } from "vitest";
import { normalizeHandle } from "./handle";

describe("normalizeHandle", () => {
  it("membuang satu awalan @", () => {
    expect(normalizeHandle("@ngaretsantri")).toBe("ngaretsantri");
  });

  it("membuang beberapa awalan @", () => {
    expect(normalizeHandle("@@syahidsyahdansaja")).toBe("syahidsyahdansaja");
  });

  it("membiarkan handle tanpa @ apa adanya", () => {
    expect(normalizeHandle("englishboostermalang")).toBe("englishboostermalang");
  });

  it("memangkas spasi di ujung", () => {
    expect(normalizeHandle("  @windi_dindra  ")).toBe("windi_dindra");
  });

  it("mengembalikan null untuk string kosong / spasi saja", () => {
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle("   ")).toBeNull();
    expect(normalizeHandle("@")).toBeNull();
    expect(normalizeHandle("@@")).toBeNull();
  });

  it("mengembalikan null untuk null / undefined", () => {
    expect(normalizeHandle(null)).toBeNull();
    expect(normalizeHandle(undefined)).toBeNull();
  });

  it("tidak mengubah karakter @ di tengah handle", () => {
    expect(normalizeHandle("user@example")).toBe("user@example");
  });

  it("idempoten — hasil normalisasi tidak berubah bila dinormalisasi lagi", () => {
    const once = normalizeHandle("@ngaretsantri");
    expect(normalizeHandle(once)).toBe(once);
  });
});
