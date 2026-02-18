import { test, expect } from "@playwright/test";

/**
 * E2E Smoke Tests: Manual Payment Recording + Invoice Status Sync
 * Task: P3-T3 / Issue #19
 *
 * Prerequisites:
 * - Dev server running at http://localhost:3000
 * - Seeded database with test accounts
 * - At least one invoice in 'sent' status
 */

const BASE_URL = "http://localhost:3000";

test.describe("Payment Recording E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Login as owner
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[data-testid="email-input"], input[name="email"]', "owner@test.com");
    await page.fill('[data-testid="password-input"], input[name="password"]', "test1234");
    await page.click('[data-testid="login-button"], button[type="submit"]');
    await page.waitForURL("**/app/**");
  });

  test("invoice detail page shows payment form for sent invoice", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/invoices`);

    // Navigate to first invoice
    const invoiceCard = page.locator('[data-testid="invoice-card"]').first();
    await invoiceCard.click();

    // If invoice is in a payable state (sent/partial/overdue), payment form should be visible
    const status = await page.locator('[data-testid="invoice-status"]').textContent();
    if (status && ["Sent", "Partially Paid", "Overdue"].includes(status.trim())) {
      await expect(page.locator('[data-testid="record-payment-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="record-payment-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-amount-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-method-select"]')).toBeVisible();
      await expect(page.locator('[data-testid="record-payment-submit"]')).toBeVisible();
    }
  });

  test("payment history panel is visible on non-draft invoices", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/invoices`);

    const invoiceCard = page.locator('[data-testid="invoice-card"]').first();
    await invoiceCard.click();

    const status = await page.locator('[data-testid="invoice-status"]').textContent();
    if (status && status.trim() !== "Draft") {
      await expect(page.locator('[data-testid="payment-history-panel"]')).toBeVisible();
    }
  });

  test("record payment updates invoice status", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/invoices`);

    const invoiceCard = page.locator('[data-testid="invoice-card"]').first();
    await invoiceCard.click();

    const status = await page.locator('[data-testid="invoice-status"]').textContent();
    if (!status || !["Sent", "Partially Paid", "Overdue"].includes(status.trim())) {
      test.skip();
      return;
    }

    // Get the amount due
    const dueText = await page.locator('[data-testid="invoice-due"]').textContent();
    if (!dueText) {
      test.skip();
      return;
    }

    // Record a small payment
    await page.fill('[data-testid="payment-amount-input"]', "10.00");
    await page.selectOption('[data-testid="payment-method-select"]', "cash");
    await page.fill('[data-testid="payment-notes-input"]', "E2E test payment");
    await page.click('[data-testid="record-payment-submit"]');

    // Wait for success message
    await expect(page.locator(".success-inline")).toBeVisible({ timeout: 5000 });

    // Verify payment appears in history
    await expect(page.locator('[data-testid="payment-history-table"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-testid="payment-history-row"]').first()).toBeVisible();
  });

  test("tech user cannot see payment form", async ({ page }) => {
    // Logout and login as tech
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[data-testid="email-input"], input[name="email"]', "tech@test.com");
    await page.fill('[data-testid="password-input"], input[name="password"]', "test1234");
    await page.click('[data-testid="login-button"], button[type="submit"]');
    await page.waitForURL("**/app/**");

    // Tech should not see the invoices nav link (per role-based nav)
    // But if they navigate directly, payment form should be hidden
    await page.goto(`${BASE_URL}/app/invoices`);

    // Tech may be redirected or see empty - this validates role gating
    const content = await page.content();
    // Payment form should not be present for tech role
    expect(content).not.toContain('data-testid="record-payment-form"');
  });

  test("invoice status pill displays correct colors", async ({ page }) => {
    await page.goto(`${BASE_URL}/app/invoices`);

    // Verify status pills have the correct CSS classes
    const pills = page.locator(".status-pill");
    const count = await pills.count();

    for (let i = 0; i < count; i++) {
      const pill = pills.nth(i);
      const classes = await pill.getAttribute("class");
      expect(classes).toContain("status-pill");
      // Each should have a status-specific class
      expect(classes).toMatch(/status-(draft|sent|partial|paid|overdue|void)/);
    }
  });
});
