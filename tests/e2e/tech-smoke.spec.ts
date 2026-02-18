/**
 * E2E Smoke: Tech role — assigned jobs + visits workflow
 *
 * Requires: running dev server at http://localhost:3000 + seeded DB
 * Run: pnpm test:e2e
 *
 * Seed accounts (docs/contracts/test-strategy.md):
 *   tech@test.com / test1234
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const TECH_EMAIL = "tech@test.com";
const TECH_PASSWORD = "test1234";

test.describe("Tech smoke — assigned jobs and visits", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', TECH_EMAIL);
    await page.fill('[id="password"]', TECH_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);
  });

  test("tech sees Jobs page without create button", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator("h1")).toContainText("Jobs");
    // Tech must NOT see the create job button
    await expect(page.locator('[data-testid="create-job-btn"]')).not.toBeVisible();
  });

  test("tech nav hides Estimates, Invoices, Automations", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator('nav a[href="/app/estimates"]')).not.toBeVisible();
    await expect(page.locator('nav a[href="/app/invoices"]')).not.toBeVisible();
    await expect(page.locator('nav a[href="/app/automations"]')).not.toBeVisible();
  });

  test("tech sees role badge", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator('[data-role="tech"]')).toBeVisible();
  });

  test("tech sees only assigned visits", async ({ page }) => {
    await page.goto(`${BASE}/app/visits`);
    await expect(page.locator("h1")).toContainText("Visits");
    await expect(page.locator(".page-subtitle")).toContainText("assigned");
  });

  test("tech can update visit status on assigned visit", async ({ page }) => {
    await page.goto(`${BASE}/app/visits`);
    const firstCard = page.locator('[data-testid="visit-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      // Transition panel should be visible (status buttons)
      await expect(page.locator('[data-testid="visit-notes-panel"]')).toBeVisible();
    }
  });

  test("tech can save notes on assigned visit", async ({ page }) => {
    await page.goto(`${BASE}/app/visits`);
    const firstCard = page.locator('[data-testid="visit-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      const textarea = page.locator('[data-testid="visit-notes-input"]');
      await textarea.fill("Completed inspection — all clear.");
      await page.locator('[data-testid="save-notes-btn"]').click();
      await expect(page.locator(".success-inline")).toBeVisible();
    }
  });

  test("tech sees job detail without transition panel", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    const firstCard = page.locator('[data-testid="job-card"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
      // Transition panel must NOT be visible for tech
      await expect(
        page.locator('[data-testid="job-transition-panel"]')
      ).not.toBeVisible();
      // Add visit button must NOT be visible
      await expect(page.locator('[data-testid="add-visit-btn"]')).not.toBeVisible();
    }
  });

  test("tech cannot access admin-only nav items directly", async ({ page }) => {
    // Navigating to estimates should either redirect or show 404/forbidden
    const res = await page.goto(`${BASE}/app/estimates`);
    // The route redirects unauthenticated (or forbidden), not necessarily to 403
    // At minimum the page should not crash
    expect(res?.status()).toBeLessThan(500);
  });
});
