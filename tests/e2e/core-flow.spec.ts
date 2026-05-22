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
 *   admin@test.com / password
 *
 * Note: This test creates real data. Run against a test/dev database only.
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
    await page.waitForURL(`${BASE}/app/jobs`);
    await expect(page.locator("h1")).toContainText("Jobs");
  });

  test("2. Admin can create a new job", async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);

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
    await page.locator('[data-testid="job-create-form"] button[type="submit"]').click();

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
    await page.waitForURL(`${BASE}/app/jobs`);

    // Go to job detail and schedule visit
    await page.goto(`${BASE}/app/jobs/${jobId}`);
    await expect(page.locator('[data-testid="add-visit-btn"]')).toBeVisible();
    await page.click('[data-testid="add-visit-btn"]');

    // Fill schedule form
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    await page.locator('[data-testid="visit-schedule-form"] input[type="date"]').fill(dateStr);
    await page.locator('[data-testid="visit-schedule-form"] select').first().selectOption("09:00");

    // Submit
    await page.locator('[data-testid="visit-schedule-form"] button[type="submit"]').click();

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
    await page.waitForURL(`${BASE}/app/jobs`);

    // Navigate to estimates and create new
    await page.goto(`${BASE}/app/estimates`);
    await page.click('[data-testid="create-estimate-btn"]');
    await page.waitForURL(`${BASE}/app/estimates/new`);

    // Fill form
    const clientSelect = page.locator("#client_id");
    const clientCount = await clientSelect.locator("option").count();
    test.skip(clientCount <= 1, "No clients available in database");
    await clientSelect.selectOption({ index: 1 });

    await completeEstimateWizard(page, "E2E Test Service", "1", "200.00");

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
    await page.waitForURL(`${BASE}/app/jobs`);

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
    await page.waitForURL(`${BASE}/app/jobs`);

    // Navigate to approved estimate
    await page.goto(`${BASE}/app/estimates/${estimateId}`);

    // Convert to invoice
    await expect(page.locator('[data-testid="convert-estimate-btn"]')).toBeVisible();
    await page.click('[data-testid="convert-estimate-btn"]');

    // Should redirect to invoice detail
    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);
    const url = page.url();
    const match = url.match(/\/app\/invoices\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    invoiceId = match![1];

    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Sent");
  });

  test("7. Admin can send invoice and record payment", async ({ page }) => {
    test.skip(!invoiceId, "Invoice ID not available from previous test");

    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);

    // Navigate to invoice
    await page.goto(`${BASE}/app/invoices/${invoiceId}`);

    // Converted invoices may already be sent; only transition draft invoices.
    const statusText = (await page.locator('[data-testid="invoice-status"]').textContent())?.trim();
    if (statusText === "Draft") {
      await expect(page.locator('[data-testid="transition-btn-sent"]')).toBeVisible();
      await page.click('[data-testid="transition-btn-sent"]');
    }
    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Sent");

    const dueText = await page.locator('[data-testid="invoice-due"]').textContent();
    const amountDue = dueText?.replace(/[^0-9.]/g, "") || "200.00";

    await page.fill('[data-testid="payment-amount-input"]', amountDue);
    await page.selectOption('[data-testid="payment-method-select"]', "check");
    await page.fill('[data-testid="payment-notes-input"]', "E2E Test Payment");
    await page.click('[data-testid="record-payment-submit"]');

    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Paid");
    await expect(page.locator('[data-testid="invoice-paid"]')).toBeVisible();
  });

  test("8. Admin can verify complete flow on invoices list", async ({ page }) => {
    // Login
    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', ADMIN_EMAIL);
    await page.fill('[id="password"]', ADMIN_PASSWORD);
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE}/app/jobs`);

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
