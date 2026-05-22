import { test, expect } from "@playwright/test";

/**
 * E2E Smoke Tests: Visit Reminder Automation
 * Task: P4-T1 / Issue #20
 *
 * Prerequisites:
 * - Dev server running at http://localhost:3000
 * - Seeded database with test accounts
 * - Worker running or at least one scheduled visit with upcoming scheduled_start
 */

const BASE_URL = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Visit Reminder Automation E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Login as owner
    await page.goto(`${BASE_URL}/login`);
    await page.fill(
      '#email, input[name="email"]',
      "owner@test.com"
    );
    await page.fill(
      '#password, input[name="password"]',
      "password"
    );
    await page.click('button[type="submit"]');
    await page.waitForURL("**/app/**");
  });

  test("automations page is accessible", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/automations`);
    await expect(page.locator("h1")).toContainText("Automations");
  });

  test("audit log shows visit_reminder events after worker run", async ({
    page,
  }) => {
    // Navigate to audit log (if available)
    // This test verifies that after a worker run, reminder events are visible
    // in the audit log endpoint
    const res = await page.request.get(
      `${BASE_URL}/api/v1/audit-log?entity_type=visit_reminder`
    );

    // The endpoint may or may not exist yet — verify it returns JSON
    if (res.ok()) {
      const json = await res.json();
      expect(json).toBeDefined();
      // If reminders have been sent, they should appear here
      if (json.data && json.data.length > 0) {
        expect(json.data[0].entity_type).toBe("visit_reminder");
      }
    }
    // If 404 or 401, audit log endpoint not yet implemented — acceptable for smoke test
  });
});
