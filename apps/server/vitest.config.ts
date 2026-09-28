import { defineConfig } from "vitest/config";

// MENGAPA config ini ada: `vitest run --passWithNoTests` sebelumnya jalan tanpa
// config — suite tanpa test dianggap lulus (sunyi di CI), artifact build
// (dist/**/*.test.js) ikut diuji dua kali, dan coverage tidak pernah diukur
// untuk 20.000+ baris route yang menangani pembayaran & OAuth.
//
// Threshold RENDAH dulu sebagai kerang naik-tahap (baseline ~1%); lihat
// apps/web/vitest.config.ts untuk alasan penuh. Yang penting: angka coverage
// muncul di CI setiap run dan tidak boleh turun.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**", "dist/**", "web-dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      thresholds: {
        lines: 2,
        functions: 2,
        statements: 2,
        branches: 2,
      },
    },
  },
});
