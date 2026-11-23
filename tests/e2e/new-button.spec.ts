import { test, expect } from "@playwright/test";

/**
 * TASK-236: one New button with three plain choices, the same on phone and
 * computer.
 */
const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('[id="email"]', "owner@test.com");
  await page.fill('[id="password"]', "password");
  await page.click('[type="submit"]');
  await page.waitForURL(/\/app/);
}

test.describe("New button on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("+ shows three choices and More; Someone called opens intake", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/app/jobs`);
    await page.getByTestId("new-button-fab").click();
    const menu = page.getByTestId("new-menu-fab");
    await expect(menu.getByText("Someone called", { exact: true })).toBeVisible();
    await expect(menu.getByText("Quick job", { exact: true })).toBeVisible();
    await expect(menu.getByText("Receipt, photo or note", { exact: true })).toBeVisible();
    await expect(menu.getByText("Log mileage", { exact: true })).not.toBeVisible();
    await menu.getByTestId("new-more").click();
    await expect(menu.getByText("Log mileage", { exact: true })).toBeVisible();
    await menu.getByText("Someone called", { exact: true }).click();
    await page.waitForURL(/\/app\/intake\/new/);
  });

  test("Quick job opens the quick job form", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/app/jobs`);
    await page.getByTestId("new-button-fab").click();
    await page.getByTestId("new-menu-fab").getByTestId("new-quick-job").click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible();
    await expect(form.getByText("Customer", { exact: true })).toBeVisible();
  });
});

test.describe("New button on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("sidebar New shows the same three choices", async ({ page }) => {
    await login(page);
    await page.getByTestId("new-button-sidebar").click();
    const menu = page.getByTestId("new-menu-sidebar");
    await expect(menu.getByText("Someone called", { exact: true })).toBeVisible();
    await expect(menu.getByText("Quick job", { exact: true })).toBeVisible();
    await expect(menu.getByText("Receipt, photo or note", { exact: true })).toBeVisible();
  });
});
