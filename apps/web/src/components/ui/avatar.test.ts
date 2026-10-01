// Avatar tanpa gambar dulu menulis SELURUH nama di dalam lingkaran, sehingga
// nama dua kata terpotong dan terbaca seperti dua kata bertumpuk ("Demo" di
// atas "Kreator" yang terpangkas). Yang benar adalah inisial.
import { describe, expect, it } from "vitest";
import { avatarInitials } from "./avatar";

describe("avatarInitials", () => {
  it("mengambil huruf pertama dua kata", () => {
    expect(avatarInitials("Demo Kreator")).toBe("DK");
    expect(avatarInitials("Sahabat Kreator Indonesia")).toBe("SK");
    expect(avatarInitials("Rina Kartika")).toBe("RK");
  });

  it("mengambil dua huruf untuk nama satu kata", () => {
    expect(avatarInitials("Rina")).toBe("RI");
    expect(avatarInitials("Kopi")).toBe("KO");
  });

  it("membiarkan inisial pendek apa adanya", () => {
    expect(avatarInitials("SK")).toBe("SK");
    expect(avatarInitials("A")).toBe("A");
  });

  it("menangani spasi berlebih dan nama kosong", () => {
    expect(avatarInitials("  Demo   Kreator  ")).toBe("DK");
    expect(avatarInitials("   ")).toBe("?");
    expect(avatarInitials("")).toBe("?");
  });

  it("tidak pernah mengembalikan lebih dari dua huruf", () => {
    for (const value of ["Demo Kreator", "Rina", "Sahabat Kreator Indonesia", "Kopi Senja"]) {
      expect(avatarInitials(value).length).toBeLessThanOrEqual(2);
    }
  });
});
