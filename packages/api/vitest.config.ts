import { defineConfig } from "vitest/config";

// Vitest config untuk packages/api — OpenAPI documents & Public API schemas.
// Lihat apps/web/vitest.config.ts untuk alasan config ini ditambahkan.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "scripts/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/openapi.json"],
      thresholds: {
        lines: 15,
        functions: 15,
        statements: 15,
        branches: 15,
      },
    },
  },
});
