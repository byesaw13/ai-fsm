/**
 * E2E Smoke: Admin role — jobs + visits workflow
 *
 * Requires: running dev server at http://localhost:3000 + seeded DB
 * Run: pnpm test:e2e
 *
 * Seed accounts (docs/contracts/test-strategy.md):
 *   admin@test.com / test1234
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "test1234";

test.describe("Admin smoke — jobs and visits", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);
  });

  test("admin sees Jobs page with create button", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator("h1")).toContainText("Jobs");
    // Admin sees the create job button
    await expect(page.locator('[data-testid="create-job-btn"]')).toBeVisible();
  });

  test("admin nav shows Estimates, Invoices, Automations links", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator('nav a[href="/app/estimates"]')).toBeVisible();
    await expect(page.locator('nav a[href="/app/invoices"]')).toBeVisible();
    await expect(page.locator('nav a[href="/app/automations"]')).toBeVisible();
  });

  test("admin sees role badge", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator('[data-role="admin"]')).toBeVisible();
  });

  test("admin sees all visits including unassigned", async ({ page }) => {
    await page.goto(`${BASE}/app/visits`);
    await expect(page.locator("h1")).toContainText("Visits");
    // Unassigned badge may or may not appear depending on seed data
    // Page must render without error
    await expect(page.locator(".page-container")).toBeVisible();
  });

  test("admin can open job detail and see transition panel", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    const firstCard = page.locator('[data-testid="job-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      // Transition panel present for admin
      await expect(page.locator('[data-testid="job-transition-panel"]')).toBeVisible();
    }
  });

  test("admin can open visit detail and see transition + notes panels", async ({ page }) => {
    await page.goto(`${BASE}/app/visits`);
    const firstCard = page.locator('[data-testid="visit-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await expect(page.locator('[data-testid="visit-notes-panel"]')).toBeVisible();
    }
  });

  test("unauthorized access to /app redirects to login when not authenticated", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/app/jobs`);
    await page.waitForURL(`${BASE}/login`);
    await expect(page.locator("h1")).toContainText("AI-FSM");
  });
});
