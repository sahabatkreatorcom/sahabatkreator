import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "playwright-screenshots";
mkdirSync(SHOTS, { recursive: true });

const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";

test.describe.configure({ mode: "serial" });

test("login ke dashboard", async ({ page }) => {
    expect(TEST_EMAIL, "TEST_EMAIL wajib diisi (env)").toBeTruthy();
    expect(TEST_PASSWORD, "TEST_PASSWORD wajib diisi (env)").toBeTruthy();

    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await page.fill("#email", TEST_EMAIL);
    await page.fill("#password", TEST_PASSWORD);
    await page.click("button[type=submit]");

    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/01-dashboard.png`, fullPage: true });
});

const PAGES: [string, string][] = [
    ["/dashboard/posts", "02-posts"],
    ["/dashboard/inbox", "03-inbox"],
    ["/dashboard/analytics", "04-analytics"],
    ["/dashboard/calendar", "05-calendar"],
    ["/dashboard/media", "06-media"],
    ["/dashboard/compose", "07-compose"],
    ["/dashboard/settings", "08-settings"],
];

for (const [path, name] of PAGES) {
    test(`screenshot ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
        await expect(page.locator("body")).toBeVisible();
    });
}