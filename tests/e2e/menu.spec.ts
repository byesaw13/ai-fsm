import { test, expect } from "@playwright/test";

/** TASK-237: five places to go, and Money on one page. */
const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("shorter menu (computer)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', "owner@test.com");
    await page.fill('[id="password"]', "password");
    await page.click('[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/app");
  });

  test("sidebar shows Desk, Jobs, Customers, Money and More; More opens the rest", async ({ page }) => {
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    for (const name of ["Desk", "Jobs", "Customers", "Money"]) {
      // Jobs and Money can carry a count badge in their name ("Jobs 3").
      await expect(nav.getByRole("link", { name: new RegExp(`^${name}\\b`) })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Settings", exact: true })).not.toBeVisible();
    await nav.getByTestId("nav-more-toggle").click();
    for (const name of ["Capture", "Day Review", "Tracking", "Reports", "Settings"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
  });

  test("Money shows owed, spent and mileage above the invoices", async ({ page }) => {
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: /^Money\b/ }).click();
    await page.waitForURL(/\/app\/invoices/);
    await expect(page.locator("h1")).toContainText("Money");
    const cards = page.locator(".p7-metric-grid");
    for (const label of ["Owed to me", "I spent", "Mileage"]) {
      await expect(cards.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("estimates are one tab away inside Jobs", async ({ page }) => {
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: /^Jobs\b/ }).click();
    await page.waitForURL(/\/app\/jobs/);
    // Hub tabs are links marked role="listitem", so match by text.
    await page.locator(".p7-hub-subnav").getByText("Estimates", { exact: true }).click();
    await page.waitForURL(/\/app\/estimates/);
  });
});
