import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('[id="email"]', "admin@test.com");
  await page.fill('[id="password"]', "password");
  await page.click('[type="submit"]');
  await page.waitForURL(/\/app/);
}

test.describe("Day Review", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("navigates to day-review page", async ({ page }) => {
    await page.goto(`${BASE}/app/day-review`);
    await expect(page.getByText("Day Review")).toBeVisible();
  });

  test("shows close checklist when business day exists", async ({ page }) => {
    await page.goto(`${BASE}/app/day-review`);
    const checklist = page.getByTestId("day-close-checklist");
    const empty = page.getByText(/No business day found/i);
    await expect(checklist.or(empty)).toBeVisible();
    if (await checklist.isVisible()) {
      await expect(page.getByText("Payroll")).toBeVisible();
      await expect(page.getByRole("button", { name: /Close Day/i })).toBeVisible();
    }
  });

  test("shows empty state when no business day exists for past date", async ({ page }) => {
    await page.goto(`${BASE}/app/day-review?date=1990-01-01`);
    await expect(page.getByText(/No business day found/i)).toBeVisible();
  });
});
