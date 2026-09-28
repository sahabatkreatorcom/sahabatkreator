// Regresi untuk bug "webhook-emit menelan semua error DB" (audit 27 Sep).
//
// Versi lama pakai `catch {}` kosong di sekitar insert delivery: komentar
// bilang "uniqueIndex violation = idempoten" (BENAR), tapi catch-all juga
// menelan koneksi putus, disk penuh, schema drift → webhook hilang tanpa jejak.
// Sekarang hanya 23505 (unique_violation) yang ditelan; sisanya di-log + re-throw.
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./webhook-emit";

describe("isUniqueViolation", () => {
  it("mengenali PostgreSQL unique_violation (code 23505)", () => {
    expect(isUniqueViolation({ code: "23505", constraint: "webhook_delivery_dedup_uidx" })).toBe(
      true,
    );
  });

  it("false untuk error DB lain — tidak boleh ditelan", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // foreign_key_violation
    expect(isUniqueViolation({ code: "23502" })).toBe(false); // not_null_violation
    expect(isUniqueViolation({ code: "08006" })).toBe(false); // connection_failure
    expect(isUniqueViolation({ code: "53100" })).toBe(false); // disk_full
  });

  it("false untuk error non-DB (network, TypeError, string)", () => {
    expect(isUniqueViolation(new TypeError("fetch failed"))).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
  });
});
