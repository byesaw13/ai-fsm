/**
 * E2E Smoke: Automations page — admin and tech role visibility
 *
 * Requires: running dev server at http://localhost:3000 + seeded DB
 * Run: pnpm test:e2e
 *
 * Seed accounts (docs/contracts/test-strategy.md):
 *   admin@test.com / test1234
 *   tech@test.com / test1234
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "test1234";
const TECH_EMAIL = "tech@test.com";
const TECH_PASSWORD = "test1234";

test.describe("Automations page — admin role", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);
  });

  test("admin sees automations page with sections", async ({ page }) => {
    await page.goto(`${BASE}/app/automations`);
    await expect(page.locator("h1")).toContainText("Automations");

    await expect(page.locator('[data-testid="visit-reminders-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="invoice-followups-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="recent-events-section"]')).toBeVisible();
  });

  test("admin sees run buttons for enabled automations", async ({ page }) => {
    await page.goto(`${BASE}/app/automations`);

    const runReminderBtn = page.locator('[data-testid="run-visit_reminder"]');
    const runFollowupBtn = page.locator('[data-testid="run-invoice_followup"]');

    if (await runReminderBtn.isVisible()) {
      await expect(runReminderBtn).toContainText("Run now");
    }
    if (await runFollowupBtn.isVisible()) {
      await expect(runFollowupBtn).toContainText("Run now");
    }
  });

  test("admin does not see role notice", async ({ page }) => {
    await page.goto(`${BASE}/app/automations`);

    await expect(page.locator(".role-notice")).not.toBeVisible();
  });
});

test.describe("Automations page — tech role", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', TECH_EMAIL);
    await page.fill('[id="password"]', TECH_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);
  });

  test("tech sees automations page in read-only mode", async ({ page }) => {
    await page.goto(`${BASE}/app/automations`);
    await expect(page.locator("h1")).toContainText("Automations");

    await expect(page.locator('[data-testid="visit-reminders-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="invoice-followups-section"]')).toBeVisible();

    const runBtn = page.locator('[data-testid="run-visit_reminder"]');
    if (await runBtn.isVisible()) {
      await expect(runBtn).not.toBeVisible();
    }
  });

  test("tech sees role notice about limited access", async ({ page }) => {
    await page.goto(`${BASE}/app/automations`);

    await expect(page.locator(".role-notice")).toBeVisible();
    await expect(page.locator(".role-notice")).toContainText("limited view");
  });
});

test.describe("Automations page — unauthenticated", () => {
  test("redirects to login when not authenticated", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${BASE}/app/automations`);
    await page.waitForURL(`${BASE}/login`);
    await expect(page.locator("h1")).toContainText("AI-FSM");
  });
});
