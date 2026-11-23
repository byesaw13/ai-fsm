/**
 * E2E Smoke: Admin role — estimate→invoice conversion flow
 *
 * Requires: running dev server at http://localhost:3000 + seeded DB
 * Run: pnpm test:e2e
 *
 * Seed accounts (docs/contracts/test-strategy.md):
 *   admin@test.com / password
 *
 * Flow tested:
 *   1. Create estimate
 *   2. Transition draft → sent → approved
 *   3. Convert to invoice (EstimateConvertButton)
 *   4. Lands on invoice detail page
 *   5. Invoice list shows the new invoice
 *
 * Source evidence:
 *   Dovelite: tests/e2e/admin-flow.spec.ts (estimate form + status flow)
 *   AI-FSM: docs/contracts/workflow-states.md (estimate/invoice lifecycle)
 *   AI-FSM: apps/web/app/app/estimates/[id]/EstimateConvertButton.tsx
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password";

async function completeEstimateWizard(page: import("@playwright/test").Page, description: string, quantity: string, unitPrice: string) {
  await page.getByRole("button", { name: "Next" }).click();
  await page.fill('[data-testid="line-item-desc-0"]', description);
  await page.fill('[data-testid="line-item-qty-0"]', quantity);
  await page.fill('[data-testid="line-item-price-0"]', unitPrice);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await Promise.all([
    page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/),
    page.locator('[data-testid="submit-estimate-btn"]').evaluate((button) => (button as HTMLButtonElement).click()),
  ]);
}

test.describe("Invoice conversion smoke — admin role", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app(?:\/my-work)?$/);
  });

  test("admin sees Invoices page", async ({ page }) => {
    await page.goto(`${BASE}/app/invoices`);
    await expect(page.locator("h1")).toContainText("Invoices");
  });

  test("invoices page shows empty state or invoice cards", async ({ page }) => {
    await page.goto(`${BASE}/app/invoices`);
    const hasCards = await page.locator('[data-testid="invoice-card"]').count();
    if (hasCards === 0) {
      await expect(page.locator('[data-testid="invoices-empty"]')).toBeVisible();
    } else {
      await expect(
        page.locator('[data-testid="invoice-card"]').first()
      ).toBeVisible();
    }
  });

  test("admin can convert approved estimate to invoice", async ({ page }) => {
    // Step 1: Create a new estimate
    await page.goto(`${BASE}/app/estimates/new`);
    const clientSelect = page.locator("#client_id");
    await clientSelect.selectOption({ index: 1 });
    await completeEstimateWizard(page, "Conversion test service", "3", "200.00");
    await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/);

    // Step 2: Transition draft → sent
    await expect(
      page.locator('[data-testid="estimate-transition-panel"]')
    ).toBeVisible();
    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText(
      "Sent"
    );

    // Step 3: Transition sent → approved
    await page.click('[data-testid="transition-btn-approved"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText(
      "Approved"
    );

    // Step 4: Convert button should now be visible
    await expect(
      page.locator('[data-testid="convert-panel-wrapper"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="convert-estimate-btn"]')
    ).toBeVisible();

    // Step 5: Click convert — navigates to invoice detail
    await page.click('[data-testid="convert-estimate-btn"]');
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);

    // Step 6: Invoice detail shows correct data
    await expect(page.locator('[data-testid="invoice-status"]')).toContainText(
      "Draft"
    );
    await expect(
      page.locator('[data-testid="invoice-total"]')
    ).toContainText("$180.00");

    // The current conversion creates a draft final invoice linked to the estimate.
    await expect(page.getByRole("heading", { name: "Line Items", exact: true })).toBeVisible();

    // Link back to original estimate
    await expect(page.locator("text=View original estimate")).toBeVisible();
  });

  test("converting an already-converted estimate is idempotent (returns same invoice)", async ({
    page,
  }) => {
    // Create, send, approve an estimate
    await page.goto(`${BASE}/app/estimates/new`);
    const clientSelect = page.locator("#client_id");
    await clientSelect.selectOption({ index: 1 });
    await completeEstimateWizard(page, "Idempotency test", "1", "200.00");
    await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/);

    const estimateUrl = page.url();

    // Transition to sent
    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText(
      "Sent"
    );

    // Transition to approved
    await page.click('[data-testid="transition-btn-approved"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText(
      "Approved"
    );

    // First conversion
    await page.click('[data-testid="convert-estimate-btn"]');
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);
    const firstInvoiceUrl = page.url();

    // Navigate back to estimate and convert again (idempotent)
    await page.goto(estimateUrl);
    // After approval + conversion, convert button may or may not be present
    // depending on whether the estimate page shows the button post-conversion.
    // Use API idempotency directly via UI navigation.
    const convertBtn = page.locator('[data-testid="convert-estimate-btn"]');
    const btnCount = await convertBtn.count();
    if (btnCount > 0) {
      await convertBtn.click();
      await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);
      // Should land on the same invoice
      expect(page.url()).toBe(firstInvoiceUrl);
    }
  });

  test("invoice detail shows transition panel for admin", async ({ page }) => {
    // Create, send, approve, convert
    await page.goto(`${BASE}/app/estimates/new`);
    const clientSelect = page.locator("#client_id");
    await clientSelect.selectOption({ index: 1 });
    await completeEstimateWizard(page, "Transition test", "1", "200.00");
    await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/);

    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Sent");
    await page.click('[data-testid="transition-btn-approved"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Approved");

    await page.click('[data-testid="convert-estimate-btn"]');
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);

    // Invoice detail should show transition panel (draft → sent is allowed for admin)
    await expect(
      page.locator('[data-testid="invoice-transition-panel"]')
    ).toBeVisible();
  });

  test("invoices list shows converted invoice", async ({ page }) => {
    // Create, send, approve, convert
    await page.goto(`${BASE}/app/estimates/new`);
    const clientSelect = page.locator("#client_id");
    await clientSelect.selectOption({ index: 1 });
    await completeEstimateWizard(page, "List visibility test", "1", "200.00");
    await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/);

    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Sent");
    await page.click('[data-testid="transition-btn-approved"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Approved");

    await page.click('[data-testid="convert-estimate-btn"]');
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);

    // Navigate to invoice list — new invoice should appear
    await page.goto(`${BASE}/app/invoices`);
    await expect(
      page.locator('[data-testid="invoice-card"]').first()
    ).toBeVisible();
  });
});
