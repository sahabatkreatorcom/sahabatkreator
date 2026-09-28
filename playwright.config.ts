import { defineConfig, devices } from "@playwright/test";

// Mengapa Vite dev server (5173) bukan server API: spec smoke hanya butuh
// web app. Server API (port 3000) butuh DATABASE_URL untuk boot — memaksanya
// jalan di setiap PR membuat e2e tidak pernah bisa lokal. Spec yang butuh API
// (login, compose) nanti pakai profile terpisah yang menjalankan `bun dev`
// (turbo dev: web + server + worker) + baseURL 3000.
const SMOKE_PORT = 5173;

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${SMOKE_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "bun dev:web",
    url: `http://localhost:${SMOKE_PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
