import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname ESM-safe (sama pola dengan vite.config.ts)
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// MENGAPA config ini ada: sebelumnya `vitest run --passWithNoTests` jalan
// TANPA config — coverage tidak diaktifkan, dan vitest memungut SEMUA file
// .test.ts/.spec.ts di seluruh repo saat dijalankan dari root (termasuk
// apps/web/e2e/*.spec.ts milik Playwright dan salinan built apps/server/dist).
// `--passWithNoTests` membuat semua ini sunyi: suite 0-test dianggap lulus,
// sehingga CI tidak pernah memberi sinyal kalau test sebenarnya tidak jalan.
//
// Threshold sengaja RENDAH dulu (baseline ~1% coverage) — ini adalah KERANG
// yang dinaikkan bertahap, bukan target. Tujuannya: mencegah coverage
// turun lagi, dan membuat angka coverage selalu terlihat di CI. Naikkan
// angka setiap kali test baru ditambahkan (lihat ANALISA-CODEBASE.md §11).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Playwright spec punya runner sendiri (playwright.config.ts); artifact
    // build server tidak boleh ikut diuji dua kali.
    exclude: ["node_modules/**", "e2e/**", "dist/**", "web-dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/sw.ts",
        "src/lib/api-schema.d.ts",
      ],
      thresholds: {
        lines: 3,
        functions: 3,
        statements: 3,
        branches: 3,
      },
    },
  },
});
