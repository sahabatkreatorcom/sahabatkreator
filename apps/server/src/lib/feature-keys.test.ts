// Penjaga sinkronisasi daftar key fitur.
//
// Daftar key dulu hidup di tiga tempat tanpa penjaga: preset di scripts/seed.ts,
// `API_FEATURES` di sini, dan `FEATURE_CATALOG` di apps/web. Karena
// `plan.features` adalah array string bebas di DB, satu typo (`api_wirte`)
// mengunci fitur untuk SEMUA tier tanpa gejala — `checkPlanFeature`
// mencocokkan `includes()` persis.
//
// Yang dijaga runtime ada di file ini; sisi katalog web dikunci `tsc` lewat
// `Record<FeatureKey, …>` di apps/web/src/lib/feature-catalog.ts, dan batas
// masuknya dijaga POST /admin/plans (lihat routes/admin-plans.test.ts).

import { FEATURE_KEYS, isFeatureKey } from "@sahabatkreator/db/feature-keys";
import {
  BUSINESS_FEATURES,
  ENTERPRISE_FEATURES,
  FREE_FEATURES,
  PRO_FEATURES,
} from "@sahabatkreator/db/feature-presets";
import { describe, expect, it } from "vitest";
import { API_FEATURES } from "./public-api";

const PRESETS = {
  free: FREE_FEATURES,
  pro: PRO_FEATURES,
  business: BUSINESS_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
};

describe("FEATURE_KEYS", () => {
  it("tidak punya duplikat", () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it("isFeatureKey menerima key katalog dan menolak typo", () => {
    expect(isFeatureKey("api_write")).toBe(true);
    expect(isFeatureKey("api_wirte")).toBe(false);
    expect(isFeatureKey("")).toBe(false);
  });
});

describe("preset fitur per tier", () => {
  it("semuanya memakai key yang dikenal", () => {
    for (const [tier, keys] of Object.entries(PRESETS)) {
      for (const key of keys) {
        expect(isFeatureKey(key), `preset ${tier} memuat key tak dikenal: ${key}`).toBe(true);
      }
    }
  });

  it("tidak punya duplikat di dalam satu tier", () => {
    for (const [tier, keys] of Object.entries(PRESETS)) {
      expect(new Set(keys).size, `preset ${tier} punya duplikat`).toBe(keys.length);
    }
  });

  it("naik paket tidak pernah menghilangkan fitur (free → pro → business → enterprise)", () => {
    expect(FREE_FEATURES.every((key) => PRO_FEATURES.includes(key))).toBe(true);
    expect(PRO_FEATURES.every((key) => BUSINESS_FEATURES.includes(key))).toBe(true);
    expect(BUSINESS_FEATURES.every((key) => ENTERPRISE_FEATURES.includes(key))).toBe(true);
  });

  it("fitur global tidak pernah masuk daftar gate", () => {
    // `holiday_ideas` (ide konten hari besar) tersedia untuk SEMUA paket dan
    // tidak pernah dipanggil lewat `checkPlanFeature`. Dulu ia terdaftar di
    // preset Free, sehingga halaman harga menampilkan ✓ di Gratis dan ✗ di tier
    // berbayar — seolah naik paket menghilangkan fitur. Kalau key ini muncul
    // lagi di FEATURE_KEYS, berarti ada yang mencoba meng-gate-nya.
    expect(isFeatureKey("holiday_ideas")).toBe(false);
  });

  it("setiap key yang bisa di-gate dipakai minimal satu tier (tidak ada key mati)", () => {
    // Key di katalog yang tidak dipakai tier mana pun tetap muncul sebagai baris
    // di halaman harga — dan seluruh kolomnya ✗. Sama menyesatkannya dengan
    // fitur global yang ikut didaftarkan.
    const used = new Set(Object.values(PRESETS).flat());
    expect(FEATURE_KEYS.filter((key) => !used.has(key))).toEqual([]);
  });
});

describe("API_FEATURES", () => {
  it("menunjuk key yang ada di katalog", () => {
    for (const key of Object.values(API_FEATURES)) {
      expect(isFeatureKey(key), `API_FEATURES memuat key tak dikenal: ${key}`).toBe(true);
    }
  });
});
