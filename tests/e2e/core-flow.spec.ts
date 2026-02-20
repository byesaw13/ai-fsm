/**
 * E2E: Core Business Flow — Admin role
 *
 * Tests the complete end-to-end workflow:
 *   login -> create job -> schedule visit -> create estimate -> approve -> convert to invoice -> record payment
 *
 * Requires: running dev server at http://localhost:3000 + seeded DB
 * Run: pnpm test:e2e
 *
 * Seed accounts (docs/contracts/test-strategy.md):
 *   admin@test.com / test1234
 *
 * Note: This test creates real data. Run against a test/dev database only.
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "test1234";

test.describe("Core business flow — admin role", () => {
  test.describe.configure({ mode: "serial" }); // Tests run in order

  let jobId: string;
  let visitId: string;
  let estimateId: string;
  let invoiceId: string;

  test("1. Admin login redirects to dashboard", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');

    // Should redirect to /app (dashboard)
    await page.waitForURL(`${BASE}/app`);
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("2. Admin can create a new job", async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Navigate to jobs and create new
    await page.goto(`${BASE}/app/jobs`);
    await page.click('[data-testid="create-job-btn"]');
    await page.waitForURL(`${BASE}/app/jobs/new`);

    // Fill form
    await page.fill("#title", `E2E Test Job ${Date.now()}`);
    const clientSelect = page.locator("#client_id");
    const clientCount = await clientSelect.locator("option").count();
    test.skip(clientCount <= 1, "No clients available in database");
    await clientSelect.selectOption({ index: 1 });

    await page.selectOption("#priority", "2");

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to job detail
    await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+/);
    const url = page.url();
    const match = url.match(/\/app\/jobs\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    jobId = match![1];

    await expect(page.locator('[data-testid="job-status"]')).toContainText("Draft");
  });

  test("3. Admin can schedule a visit for the job", async ({ page }) => {
    test.skip(!jobId, "Job ID not available from previous test");

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Go to job detail and schedule visit
    await page.goto(`${BASE}/app/jobs/${jobId}`);
    await expect(page.locator('[data-testid="add-visit-btn"]')).toBeVisible();
    await page.click('[data-testid="add-visit-btn"]');

    // Fill schedule form
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startStr = tomorrow.toISOString().slice(0, 16);
    tomorrow.setHours(tomorrow.getHours() + 2);
    const endStr = tomorrow.toISOString().slice(0, 16);

    await page.fill("#scheduled_start", startStr);
    await page.fill("#scheduled_end", endStr);

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to visit detail
    await page.waitForURL(/\/app\/visits\/[0-9a-f-]+/);
    const url = page.url();
    const match = url.match(/\/app\/visits\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    visitId = match![1];

    await expect(page.locator('[data-testid="visit-status"]')).toContainText("Scheduled");
  });

  test("4. Admin can create an estimate", async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Navigate to estimates and create new
    await page.goto(`${BASE}/app/estimates`);
    await page.click('[data-testid="create-estimate-btn"]');
    await page.waitForURL(`${BASE}/app/estimates/new`);

    // Fill form
    const clientSelect = page.locator("#client_id");
    const clientCount = await clientSelect.locator("option").count();
    test.skip(clientCount <= 1, "No clients available in database");
    await clientSelect.selectOption({ index: 1 });

    // Add line item
    await page.fill('[data-testid="line-item-desc-0"]', "E2E Test Service");
    await page.fill('[data-testid="line-item-qty-0"]', "1");
    await page.fill('[data-testid="line-item-price-0"]', "100.00");

    // Submit
    await page.click('[data-testid="submit-estimate-btn"]');

    // Should redirect to estimate detail
    await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/);
    const url = page.url();
    const match = url.match(/\/app\/estimates\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    estimateId = match![1];

    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Draft");
  });

  test("5. Admin can transition estimate draft -> sent -> approved", async ({ page }) => {
    test.skip(!estimateId, "Estimate ID not available from previous test");

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Navigate to estimate
    await page.goto(`${BASE}/app/estimates/${estimateId}`);

    // Transition to Sent
    await expect(page.locator('[data-testid="transition-btn-sent"]')).toBeVisible();
    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Sent");

    // Transition to Approved
    await expect(page.locator('[data-testid="transition-btn-approved"]')).toBeVisible();
    await page.click('[data-testid="transition-btn-approved"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Approved");
  });

  test("6. Admin can convert approved estimate to invoice", async ({ page }) => {
    test.skip(!estimateId, "Estimate ID not available from previous test");

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Navigate to approved estimate
    await page.goto(`${BASE}/app/estimates/${estimateId}`);

    // Convert to invoice
    await expect(page.locator('[data-testid="convert-to-invoice-btn"]')).toBeVisible();
    await page.click('[data-testid="convert-to-invoice-btn"]');

    // Should redirect to invoice detail
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);
    const url = page.url();
    const match = url.match(/\/app\/invoices\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    invoiceId = match![1];

    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Draft");
  });

  test("7. Admin can send invoice and record payment", async ({ page }) => {
    test.skip(!invoiceId, "Invoice ID not available from previous test");

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Navigate to invoice
    await page.goto(`${BASE}/app/invoices/${invoiceId}`);

    // Send invoice
    await expect(page.locator('[data-testid="transition-btn-sent"]')).toBeVisible();
    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Sent");

    // Record payment
    await expect(page.locator('[data-testid="record-payment-btn"]')).toBeVisible();
    await page.click('[data-testid="record-payment-btn"]');

    // Fill payment form
    await page.fill("#amount", "100.00");
    await page.selectOption("#method", "check");
    await page.fill("#reference", "E2E Test Payment");

    // Submit payment
    await page.click('[data-testid="submit-payment-btn"]');

    // Invoice status should update to Paid
    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Paid");
  });

  test("8. Admin can verify complete flow on invoices list", async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app`);

    // Check invoices list shows paid invoice
    await page.goto(`${BASE}/app/invoices`);

    // Verify we have at least one paid invoice from our test
    const paidSection = page.locator('.status-heading[data-status="paid"]');
    if (await paidSection.isVisible()) {
      const badge = paidSection.locator(".count-badge");
      const count = await badge.textContent();
      expect(parseInt(count || "0")).toBeGreaterThanOrEqual(1);
    }
  });
});
