// Allowlist /v1 harus cocok dengan router asli.
//
// `mountRoutes` melempar saat modul di-import bila ada entri allowlist yang tidak
// menemukan rutenya (fail-fast, lihat mount.ts). Artinya mengimpor modul ini
// SENDIRI sudah merupakan assertion — dan itu satu-satunya cara mismatch
// ketahuan, karena repo ini tidak punya CI dan `v1Route` hanya diimpor
// `src/index.ts` (yaitu saat server boot, bukan saat test).
//
// Dijaga di sini supaya menambah entri allowlist untuk rute yang salah ketik
// gagal di test, bukan di produksi.
import { describe, expect, it } from "vitest";
// Import STATIS (bukan `await import()` di dalam test): memuat seluruh graf
// router butuh >5 detik, sedangkan batas waktu test hanya berlaku di dalam
// `it()`. Kalau allowlist tidak cocok, import ini melempar saat modul dimuat.
import { v1Route } from "./index";

describe("allowlist /v1", () => {
  it("setiap entri menemukan rutenya di router asli (tanpa entri yatim)", () => {
    expect(v1Route).toBeDefined();

    // Bukti nyata: rute connect fase 3 benar-benar terpasang di /v1.
    const paths = v1Route.routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain("POST /accounts/:platform/connect");
    expect(paths).toContain("POST /accounts/:platform/exchange");
    expect(paths).toContain("GET /accounts/pending/:id");
    expect(paths).toContain("POST /accounts/pending/:id/select");
  });
});
