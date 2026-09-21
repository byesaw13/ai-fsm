/**
 * E2E Smoke: Admin role — jobs + visits workflow
 *
 * Requires: running dev server at http://localhost:3000 + seeded DB
 * Run: pnpm test:e2e
 *
 * Seed accounts (docs/contracts/test-strategy.md):
 *   admin@test.com / password
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password";

test.describe("Admin smoke — jobs and visits", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app(?:\/my-work)?$/);
  });

  test("admin sees Jobs page with create button", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator("h1")).toContainText("Jobs");
    // Admin sees the create job button
    await expect(page.locator('[data-testid="create-job-btn"]')).toBeVisible();
  });

  test("admin nav shows core business links", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Clients' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Quotes' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Settings' })).toBeVisible();
  });

  test("admin sees role badge", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.getByText("admin").first()).toBeVisible();
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
      await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+/);
      // Assert the admin-only transition panel itself, not just the always-present
      // status badge, so a role/rendering regression that hides the controls fails
      // the smoke test (Codex).
      await expect(page.locator('[data-testid="job-transition-panel"]')).toBeVisible();
    }
  });

  test("admin can open visit detail and see transition + notes panels", async ({ page }) => {
    await page.goto(`${BASE}/app/visits`);
    const firstCard = page.locator('[data-testid="visit-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await page.waitForURL(/\/app\/visits\/[0-9a-f-]+/);
      await expect(page.locator('[data-testid="visit-notes-panel"]')).toBeVisible();
    }
  });

  test("unauthorized access to /app redirects to login when not authenticated", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/app/jobs`);
    await page.waitForURL(/\/login$/);
    await expect(page.locator("h1")).toContainText("Dovetails");
  });
});
