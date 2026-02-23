import { expect, test } from "@playwright/test";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "test1234";

test("admin can create client, property, and job from property context", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", ADMIN_EMAIL);
  await page.fill("#password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/app`);

  const nonce = Date.now();
  const clientName = `E2E Client ${nonce}`;
  const propertyAddress = `${100 + (nonce % 800)} Test Oak Ave`;

  await page.goto(`${BASE}/app/clients`);
  await page.click('[data-testid="create-client-btn"]');
  await page.waitForURL(`${BASE}/app/clients/new`);
  await page.fill("#name", clientName);
  await page.fill("#email", `e2e+${nonce}@test.com`);
  await page.fill("#phone", "555-0100");
  await page.click('[data-testid="submit-client-create-btn"]');
  await page.waitForURL(/\/app\/clients\/[0-9a-f-]+/);
  await expect(page.locator("h1")).toContainText(clientName);

  await page.click('[data-testid="add-property-btn"]');
  await page.waitForURL(/\/app\/properties\/new\?client_id=/);
  await page.fill("#property_name", "Main Site");
  await page.fill("#address", propertyAddress);
  await page.fill("#city", "Austin");
  await page.fill("#state", "TX");
  await page.fill("#zip", "78701");
  await page.click('[data-testid="submit-property-create-btn"]');
  await page.waitForURL(/\/app\/properties\/[0-9a-f-]+/);
  await expect(page.locator("h1")).toContainText("Main Site");

  await page.click('[data-testid="create-job-from-property-btn"]');
  await page.waitForURL(/\/app\/jobs\/new\?client_id=.*property_id=.*/);
  await expect(page.locator("#client_id")).not.toHaveValue("");
  await expect(page.locator("#property_id")).not.toHaveValue("");
  await page.fill("#title", `E2E Property Job ${nonce}`);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+/);
  await expect(page.locator('[data-testid="job-status"]')).toContainText("Draft");
});
