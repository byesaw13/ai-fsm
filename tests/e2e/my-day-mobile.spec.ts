import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const OWNER_EMAIL = "owner@test.com";
const OWNER_PASSWORD = "password";

test.describe("My Day mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', OWNER_EMAIL);
    await page.fill('[id="password"]', OWNER_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app\/my-(?:day|work)/);
  });

  test("no horizontal page overflow", async ({ page }) => {
    await page.goto(`${BASE}/app/my-work`);
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(overflow.sw).toBeLessThanOrEqual(overflow.cw + 1);
  });

  test("start my day entry visible", async ({ page }) => {
    await page.goto(`${BASE}/app/my-work`);
    const startBtn = page.getByTestId("start-my-day-button");
    const statusPill = page.getByTestId("day-status-pill");
    await expect(startBtn.or(statusPill)).toBeVisible();
  });

  test("wizard opens with three steps", async ({ page }) => {
    await page.goto(`${BASE}/app/my-work`);
    const startBtn = page.getByTestId("start-my-day-button");
    if (!(await startBtn.isVisible())) {
      test.skip();
    }
    await startBtn.click();
    const wizard = page.getByTestId("start-my-day-wizard");
    await expect(wizard).toBeVisible();
    await expect(wizard.getByRole("button", { name: "Clock in" })).toBeVisible();
    await expect(wizard.getByRole("button", { name: "Vehicle & odometer" })).toBeVisible();
    await expect(wizard.getByRole("button", { name: "Start mileage" })).toBeVisible();
  });

  test("quick actions grid visible", async ({ page }) => {
    await page.goto(`${BASE}/app/my-work`);
    await expect(page.getByTestId("field-quick-actions")).toBeVisible();
    await expect(page.getByText("Log Mileage")).toBeVisible();
  });

  test("FAB hidden on my day", async ({ page }) => {
    await page.goto(`${BASE}/app/my-work`);
    await expect(page.locator(".p7-fab-wrap button[aria-label*='quick actions']")).not.toBeVisible();
  });
});