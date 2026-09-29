// Uji pemisahan baris fitur jadi dua kartu di halaman /harga:
// "Semua paket dapat" (sharedFeatureKeys) vs tabel perbandingan (featureRows).
//
// Properti terpenting yang dijaga di sini: gabungan keduanya HARUS persis sama
// dengan seluruh katalog — tidak boleh ada fitur yang hilang (tidak tampil di
// mana pun) atau tampil dua kali. Perhitungannya dari satu sumber data, jadi
// admin yang mengubah plan.features tidak bisa membuat kartu & tabel
// bertentangan.
import { describe, expect, it } from "vitest";
import { FEATURE_CATALOG } from "@/lib/feature-catalog";
import { annualToggleLabel, featureRows, type Plan, sharedFeatureKeys } from "./pricing-shared";

function plan(tier: string, features: string[] | null): Plan {
  return {
    id: `plan_${tier}`,
    tier,
    name: tier,
    description: null,
    priceIdr: 0,
    billingIntervalMonths: 1,
    maxSocialAccounts: 1,
    maxScheduledPostsPerMonth: 10,
    maxTeamMembers: 1,
    maxMediaStorageMb: 500,
    aiCreditsPerMonth: 0,
    renderCreditsPerMonth: 50,
    features,
  };
}

const ALL_KEYS = FEATURE_CATALOG.map((f) => f.key);

describe("sharedFeatureKeys", () => {
  it("mengembalikan [] untuk data plan kosong", () => {
    // `every()` pada array kosong selalu true — tanpa penjaga ini SEMUA fitur
    // akan diklaim tersedia di semua paket saat data plan belum termuat.
    expect(sharedFeatureKeys([])).toEqual([]);
  });

  it("hanya mengambil key yang dimiliki SETIAP paket", () => {
    const source = [
      plan("free", ["scheduling", "analytics"]),
      plan("pro", ["scheduling", "analytics", "ai_coach"]),
    ];
    expect(sharedFeatureKeys(source)).toEqual(["scheduling", "analytics"]);
  });

  it("mengabaikan features null", () => {
    const source = [plan("free", ["scheduling"]), plan("pro", null)];
    expect(sharedFeatureKeys(source)).toEqual([]);
  });

  it("mempertahankan urutan katalog", () => {
    expect(sharedFeatureKeys([plan("free", [...ALL_KEYS])])).toEqual(ALL_KEYS);
  });
});

describe("featureRows dengan exclude", () => {
  const source = [plan("free", ["scheduling"]), plan("pro", ["scheduling", "ai_coach"])];

  it("membuang baris yang sudah tampil di kartu 'Semua paket dapat'", () => {
    const shared = sharedFeatureKeys(source);
    const labels = featureRows(source, shared).map((r) => r.label);
    const sharedLabels = FEATURE_CATALOG.filter((f) => shared.includes(f.key)).map((f) => f.label);

    for (const label of sharedLabels) expect(labels).not.toContain(label);
    expect(labels).toContain("Coach AI mingguan");
  });

  it("shared + pembeda menutup seluruh katalog tanpa duplikat", () => {
    const shared = sharedFeatureKeys(source);
    const sharedLabels = FEATURE_CATALOG.filter((f) => shared.includes(f.key)).map((f) => f.label);
    const diffLabels = featureRows(source, shared).map((r) => r.label);
    const combined = [...sharedLabels, ...diffLabels];
    const allLabels = FEATURE_CATALOG.map((f) => f.label);

    expect(combined).toHaveLength(allLabels.length);
    expect(new Set(combined).size).toBe(allLabels.length);
    expect([...combined].sort()).toEqual([...allLabels].sort());
  });

  it("sel pembeda tetap benar setelah exclude", () => {
    const shared = sharedFeatureKeys(source);
    const row = featureRows(source, shared).find((r) => r.label === "Coach AI mingguan");
    expect(row?.cells(source).map((c) => c.kind)).toEqual(["cross", "check"]);
  });

  it("tanpa exclude tetap mengembalikan seluruh katalog (kompatibel)", () => {
    expect(featureRows(source)).toHaveLength(FEATURE_CATALOG.length);
  });
});

describe("annualToggleLabel", () => {
  it("null untuk input kosong", () => {
    expect(annualToggleLabel([])).toBeNull();
  });

  it("null saat tidak ada tier tahunan yang benar-benar lebih murah", () => {
    const monthly = { ...plan("pro", null), priceIdr: 49000 };
    // Plan bulanan dipasangkan dengan dirinya sendiri → selisih 0.
    expect(annualToggleLabel([{ plan: monthly, monthly }])).toBeNull();
  });

  it("menghitung bulan gratis dari selisih harga tahunan", () => {
    const monthly = { ...plan("pro", null), priceIdr: 49000 };
    const yearly = { ...plan("pro", null), priceIdr: 490000, billingIntervalMonths: 12 };
    expect(annualToggleLabel([{ plan: yearly, monthly }])).toBe("Hemat hingga 2 bulan");
  });

  it("fallback label generik saat selisih tidak bulat", () => {
    // 1.200.000 - 1.050.000 = 150.000 → 1,5 bulan (bukan bulat).
    const monthly = { ...plan("pro", null), priceIdr: 100000 };
    const yearly = { ...plan("pro", null), priceIdr: 1050000, billingIntervalMonths: 12 };
    expect(annualToggleLabel([{ plan: yearly, monthly }])).toBe("Hemat dengan paket tahunan");
  });

  it("mengabaikan plan tahunan yang TIDAK hemat tetapi tetap menangkap yang hemat", () => {
    const monthly = { ...plan("pro", null), priceIdr: 49000 };
    const badYearly = { ...plan("pro", null), priceIdr: 700000, billingIntervalMonths: 12 };
    const goodYearly = { ...plan("business", null), priceIdr: 1490000, billingIntervalMonths: 12 };
    const goodMonthly = { ...plan("business", null), priceIdr: 149000 };
    expect(
      annualToggleLabel([
        { plan: badYearly, monthly },
        { plan: goodYearly, monthly: goodMonthly },
      ]),
    ).toBe("Hemat hingga 2 bulan");
  });
});
