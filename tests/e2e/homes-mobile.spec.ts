import { test, expect } from "@playwright/test";

/**
 * TASK-238: on a phone, the owner lands on Today, and a deliberate tap on Desk
 * opens Desk and stays there. The logo still goes to the preferred home.
 */
const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Today and Desk never bounce (phone)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', "owner@test.com");
    await page.fill('[id="password"]', "password");
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app\/my-work/);
  });

  test("Switch to Desk opens Desk and stays there", async ({ page }) => {
    await page.getByTestId("switch-to-desk").click();
    await page.waitForURL((url) => url.pathname === "/app");
    // The old auto-route replaced Desk with Today right after load; give it time to try.
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).pathname).toBe("/app");
    await expect(page.getByTestId("switch-to-today")).toBeVisible();
  });

  test("Switch to Today goes back to Today", async ({ page }) => {
    await page.getByTestId("switch-to-desk").click();
    await page.waitForURL((url) => url.pathname === "/app");
    await page.getByTestId("switch-to-today").click();
    await page.waitForURL(/\/app\/my-work/);
    await expect(page.getByTestId("switch-to-desk")).toBeVisible();
  });

  test("the home link (?home=1) still lands on the phone's home, Today", async ({ page }) => {
    await page.getByTestId("switch-to-desk").click();
    await page.waitForURL((url) => url.pathname === "/app");
    await page.goto(`${BASE}/app?home=1`);
    await page.waitForURL((url) => url.pathname === "/app/my-work" && url.search === "");
  });
});

test.describe("the logo goes to the preferred home (computer)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("from Today, the logo returns a computer owner to Desk", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', "owner@test.com");
    await page.fill('[id="password"]', "password");
    await page.click('[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/app");
    await page.getByTestId("switch-to-today").click();
    await page.waitForURL(/\/app\/my-work/);
    await page.locator("a.p7-sidebar-brand").click();
    await page.waitForURL((url) => url.pathname === "/app" && url.search === "");
  });
});
