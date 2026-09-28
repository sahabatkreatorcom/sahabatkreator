import { defineConfig } from "vitest/config";

// Vitest config untuk packages/queue — BullMQ queues & processors.
// Lihat apps/web/vitest.config.ts untuk alasan config ini ditambahkan.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      thresholds: {
        lines: 8,
        functions: 8,
        statements: 8,
        branches: 8,
      },
    },
  },
});
