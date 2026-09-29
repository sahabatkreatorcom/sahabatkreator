// Penjaga katalog fitur web agar tidak drift dari sumber kebenaran key fitur di
// packages/db, dan agar daftar fitur GLOBAL tidak berubah jadi fitur berbayar.
//
// MENGAPA impor lewat path sumber, bukan "@sahabatkreator/db": barrel package
// itu menarik drizzle/pg + validasi env, sementara test ini jalan di jsdom tanpa
// DATABASE_URL. `packages/db/src/feature-keys.ts` sendiri tidak punya impor
// sama sekali, jadi aman dibaca langsung.
import { describe, expect, it } from "vitest";
import { FEATURE_KEYS } from "../../../../packages/db/src/feature-keys";
import { FEATURE_CATALOG, featureLabel, GLOBAL_FEATURES } from "./feature-catalog";

describe("FEATURE_CATALOG", () => {
  it("menutup semua key di FEATURE_KEYS tanpa duplikat", () => {
    const keys = FEATURE_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it("setiap entri punya label & hint terisi", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.label.trim().length).toBeGreaterThan(0);
      expect(f.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("featureLabel mengembalikan label katalog, bukan key mentah", () => {
    for (const f of FEATURE_CATALOG) {
      expect(featureLabel(f.key)).toBe(f.label);
      expect(featureLabel(f.key)).not.toBe(f.key);
    }
  });

  it("featureLabel fallback ke key apa adanya untuk key tak dikenal", () => {
    // Data seed lama / key yang sudah dihapus tetap tampil apa adanya, bukan
    // kosong — supaya barisnya tidak jadi tak terbaca.
    expect(featureLabel("key_yang_tidak_ada")).toBe("key_yang_tidak_ada");
  });
});

describe("GLOBAL_FEATURES", () => {
  it("tidak bertabrakan dengan FEATURE_KEYS", () => {
    // Kalau sebuah key ada di dua daftar, fitur itu sebenarnya digerbang per
    // paket tetapi diklaim tersedia untuk semua paket — persis bug
    // `holiday_ideas` (✓ di Gratis, ✗ di tier berbayar).
    const featureKeys = new Set<string>(FEATURE_KEYS);
    for (const g of GLOBAL_FEATURES) {
      expect(featureKeys.has(g.key)).toBe(false);
    }
  });

  it("tidak bertabrakan dengan katalog, dan labelnya tidak duplikat", () => {
    const catalogKeys = new Set<string>(FEATURE_CATALOG.map((f) => f.key));
    const catalogLabels = new Set<string>(FEATURE_CATALOG.map((f) => f.label));
    for (const g of GLOBAL_FEATURES) {
      expect(catalogKeys.has(g.key)).toBe(false);
      expect(catalogLabels.has(g.label)).toBe(false);
    }
  });

  it("key unik serta label & hint terisi", () => {
    const keys = GLOBAL_FEATURES.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const g of GLOBAL_FEATURES) {
      expect(g.label.trim().length).toBeGreaterThan(0);
      expect(g.hint.trim().length).toBeGreaterThan(0);
    }
  });
});
