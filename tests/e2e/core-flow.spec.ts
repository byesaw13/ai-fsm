/**
 * E2E: Required Release Smoke — Admin role
 *
 * Tests the launch-critical workflow:
 *   login -> create client -> create job -> schedule visit -> create estimate -> approve -> convert to invoice -> record payment
 *
 * Requires: running server at TEST_BASE_URL + migrated/seeded test DB.
 * Seed account: admin@test.com / password
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password";

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('[id="email"]', ADMIN_EMAIL);
  await page.fill('[id="password"]', ADMIN_PASSWORD);
  await page.click('[type="submit"]');
  // Post-login lands everyone on My Day; a pure admin (this seed account) is
  // bounced to the Overview dashboard at /app. Wait for that landing.
  await page.waitForURL(`${BASE}/app`);
}

async function completeEstimateWizard(page: Page) {
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Drywall patch <=6/ }).click();
  await page.locator("#pb-custom-price").fill("250.00");
  await page.getByRole("button", { name: /Add to Estimate/ }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await Promise.all([
    page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/),
    page.locator('[data-testid="submit-estimate-btn"]').evaluate((button) => (button as HTMLButtonElement).click()),
  ]);
}

test.describe("Required release smoke — admin core flow", () => {
  test.describe.configure({ mode: "serial" });

  let clientName: string;
  let jobId: string;
  let visitId: string;
  let estimateId: string;
  let invoiceId: string;

  test("1. Admin login lands on the Overview dashboard", async ({ page }) => {
    await login(page);
    await expect(page.locator("h1")).toContainText("Dashboard");
  });

  test("2. Admin can create a launch client", async ({ page }) => {
    await login(page);

    const nonce = Date.now();
    clientName = `Release Smoke Client ${nonce}`;

    await page.goto(`${BASE}/app/clients`);
    await page.click('[data-testid="create-client-btn"]');
    await page.waitForURL(`${BASE}/app/clients/new`);
    await page.fill("#name", clientName);
    await page.fill("#email", `release-smoke+${nonce}@test.com`);
    await page.fill("#phone", "555-0100");
    await page.click('[data-testid="submit-client-create-btn"]');

    await page.waitForURL(/\/app\/clients\/[0-9a-f-]+/);
    await expect(page.locator("h1")).toContainText(clientName);
  });

  test("3. Admin can create a job for the launch client", async ({ page }) => {
    expect(clientName).toBeTruthy();
    await login(page);

    await page.goto(`${BASE}/app/jobs`);
    await page.click('[data-testid="create-job-btn"]');
    await page.waitForURL(`${BASE}/app/jobs/new`);

    await page.fill("#title", `Release Smoke Job ${Date.now()}`);
    await page.locator("#client_id").selectOption({ label: clientName });
    await page.selectOption("#priority", "2");
    await page.locator('[data-testid="job-create-form"] button[type="submit"]').click();

    await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+/);
    const match = page.url().match(/\/app\/jobs\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    jobId = match![1];

    await expect(page.locator('[data-testid="job-status"]')).toContainText("Draft");
  });

  test("4. Admin can schedule a visit for the job", async ({ page }) => {
    expect(jobId).toBeTruthy();
    await login(page);

    await page.goto(`${BASE}/app/jobs/${jobId}`);
    await expect(page.locator('[data-testid="add-visit-btn"]')).toBeVisible();
    await page.click('[data-testid="add-visit-btn"]');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    await page.locator('[data-testid="visit-schedule-form"] input[type="date"]').fill(dateStr);
    await page.locator('[data-testid="visit-schedule-form"] select').first().selectOption("09:00");
    await page.locator('[data-testid="visit-schedule-form"] button[type="submit"]').click();

    await page.waitForURL(/\/app\/visits\/[0-9a-f-]+/);
    const match = page.url().match(/\/app\/visits\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    visitId = match![1];

    await expect(page.locator('[data-testid="visit-status"]')).toContainText("Scheduled");
  });

  test("5. Admin can create an estimate for the launch client", async ({ page }) => {
    expect(clientName).toBeTruthy();
    await login(page);

    await page.goto(`${BASE}/app/estimates`);
    await page.click('[data-testid="create-estimate-btn"]');
    await page.waitForURL(`/app/estimates/new`);
    await page.click('[data-testid="estimate-mode-detailed"]');

    await page.locator("#client_id").selectOption({ label: clientName });
    await completeEstimateWizard(page);

    await page.waitForURL(/\/app\/estimates\/[0-9a-f-]+/);
    const match = page.url().match(/\/app\/estimates\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    estimateId = match![1];

    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Draft");
  });

  test("6. Admin can transition estimate draft -> sent -> approved", async ({ page }) => {
    expect(estimateId).toBeTruthy();
    await login(page);

    await page.goto(`${BASE}/app/estimates/${estimateId}`);
    await expect(page.locator('[data-testid="transition-btn-sent"]')).toBeVisible();
    await page.click('[data-testid="transition-btn-sent"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Sent");

    await expect(page.locator('[data-testid="transition-btn-approved"]')).toBeVisible();
    await page.click('[data-testid="transition-btn-approved"]');
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Approved");
  });

  test("7. Admin can convert approved estimate to invoice", async ({ page }) => {
    expect(estimateId).toBeTruthy();
    await login(page);

    await page.goto(`${BASE}/app/estimates/${estimateId}`);
    await expect(page.locator('[data-testid="estimate-status"]')).toContainText("Approved");
    // Convert lives on the green approved banner (and handoff card).
    await expect(page.locator('[data-testid="approved-banner"]')).toBeVisible({ timeout: 10000 });
    const convertBtn = page.locator('[data-testid="convert-estimate-btn"]');
    await expect(convertBtn).toBeVisible({ timeout: 10000 });
    await convertBtn.click();

    await page.waitForURL(/\/app\/invoices\/[0-9a-f-]+/);
    const match = page.url().match(/\/app\/invoices\/([0-9a-f-]+)/);
    expect(match).toBeTruthy();
    invoiceId = match![1];

    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Draft");
  });

  test("8. Admin can record payment on the invoice", async ({ page }) => {
    expect(invoiceId).toBeTruthy();
    await login(page);

    await page.goto(`${BASE}/app/invoices/${invoiceId}`);
    const statusText = (await page.locator('[data-testid="invoice-status"]').textContent())?.trim();
    if (statusText === "Draft") {
      await expect(page.locator('[data-testid="invoice-transition-btn-sent"]')).toBeVisible();
      await page.click('[data-testid="invoice-transition-btn-sent"]');
    }
    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Sent");

    const dueText = await page.locator('[data-testid="invoice-due"]').textContent();
    const amountDue = dueText?.replace(/[^0-9.]/g, "") || "200.00";

    await page.fill('[data-testid="payment-amount-input"]', amountDue);
    await page.selectOption('[data-testid="payment-method-select"]', "check");
    await page.fill('[data-testid="payment-notes-input"]', "Release smoke payment");
    await page.click('[data-testid="record-payment-submit"]');

    await expect(page.locator('[data-testid="invoice-status"]')).toContainText("Paid");
    await expect(page.locator('[data-testid="invoice-paid"]')).toBeVisible();
  });

  test("9. Admin can verify the paid invoice on invoices list", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/app/invoices`);

    const paidInvoice = page.locator(`a[href="/app/invoices/${invoiceId}"]`);
    await expect(paidInvoice).toBeVisible();
    // Status reads from the group header now — per-card status badges were
    // removed as redundant (cards are grouped under their status section).
    await expect(
      page.locator(".p7-status-section-header span", { hasText: /^Paid$/ })
    ).toBeVisible();
  });
});
