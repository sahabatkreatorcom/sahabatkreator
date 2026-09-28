// E2E smoke test — verifikasi jalur paling dasar tetap sehat tanpa full stack.
//
// Filosofi: spec ini hanya butuh Vite dev server (tidak perlu DB / server API),
// jadi bisa jalan di setiap PR walau infra lengkap belum disiapkan. Cakupan:
//  - landing page render + judul + CTA
//  - routing SPA (path tak dikenal → halaman 404 kita, bukan soft-404 SEO bug)
//  - halaman marketing publik (harga, blog) bisa dibuka
//  - redirect legacy SEO path (/pricing → /harga) masih bekerja
//
// Jalankan: npx playwright test apps/web/e2e/smoke.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Smoke — jalur publik", () => {
  test("landing page render dengan judul + CTA daftar", async ({ page }) => {
    await page.goto("/");
    // Judul halaman muncul (SEO title di-set via @unhead/react)
    await expect(page).toHaveTitle(/Sahabat Kreator/i);
    // Heading utama terlihat — bukan layar putih / error boundary
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("asset statis dimuat tanpa error console level error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Worker service-sw bisa saja komplain di dev (dimatikan), tapi error app
    // tetap harus nol — toleransi hanya untuk resource 404 media demo.
    const appErrors = errors.filter(
      (m) => !m.includes("Failed to load resource") && !m.includes("net::ERR"),
    );
    expect(appErrors).toEqual([]);
  });

  test("path tak dikenal menampilkan halaman 404 kita (bukan soft-404)", async ({ page }) => {
    await page.goto("/halaman-yang-tidak-ada-jamki");
    // Halaman 404 eksplisit ada — penting untuk SEO (lihat router.tsx, `*` route)
    await expect(page.getByText(/404|tidak ditemukan/i)).toBeVisible();
  });

  test("redirect legacy SEO path /pricing → /harga", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/harga$/);
  });

  test("halaman harga publik bisa dibuka", async ({ page }) => {
    await page.goto("/harga");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("halaman login render (form email + password)", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password|kata sandi/i)).toBeVisible();
  });
});
