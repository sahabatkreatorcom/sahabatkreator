// Test parseDateParam — filter rentang tanggal (?from=&to=) di route admin/AI.
// Bug pernah terjadi: helper didefinisikan lokal di ai.ts lalu dipakai di
// admin-billing.ts tanpa import → ReferenceError setiap kali endpoint dipanggil.
// Sekarang helper ini live di lib/date.ts (satu sumber).

import { describe, expect, it } from "vitest";
import { parseDateParam } from "./date";

describe("parseDateParam", () => {
  it("parse YYYY-MM-DD ke awal hari (00:00:00 waktu lokal)", () => {
    // Tanpa suffix Z, JS parse sebagai waktu lokal — sama seperti behavior
    // route: filter from dipakai bersama timezone org (Asia/Jakarta).
    const d = parseDateParam("2026-09-28");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getHours()).toBe(0);
    expect(d?.getMinutes()).toBe(0);
  });

  it("endOfDay menyetel 23:59:59.999 supaya rentang <= to inklusif", () => {
    // Tanpa ini, baris yang dibuat di hari `to` setelah tengah malam akan
    // terlewat oleh filter lte(createdAt, to).
    const d = parseDateParam("2026-09-28", true);
    expect(d?.getHours()).toBe(23);
    expect(d?.getMinutes()).toBe(59);
    expect(d?.getMilliseconds()).toBe(999);
  });

  it("input kosong / undefined → null (filter tidak diisi)", () => {
    expect(parseDateParam(undefined)).toBeNull();
    expect(parseDateParam("")).toBeNull();
  });

  it("tanggal invalid → null, bukan throw", () => {
    expect(parseDateParam("bukan-tanggal")).toBeNull();
    expect(parseDateParam("2026-13-45")).toBeNull();
  });
});
