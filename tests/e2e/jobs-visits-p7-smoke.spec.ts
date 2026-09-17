import { expect, test } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = "admin@test.com";
const ADMIN_PASSWORD = "password";

test.describe("P7 jobs/visits smoke", () => {
  test("admin can create a job and schedule a visit using P7 screens", async ({
    page,
  }) => {
    await page.goto(`${BASE}/login`);
    await page.fill("#email", ADMIN_EMAIL);
    await page.fill("#password", ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/app(?:\/my-work)?$/);

    await page.goto(`${BASE}/app/jobs`);
    await expect(page.locator("h1")).toContainText("Jobs");
    await page.click('[data-testid="create-job-btn"]');
    await page.waitForURL(`${BASE}/app/jobs/new`);

    await page.fill("#title", `P7 Smoke Job ${Date.now()}`);
    const clientSelect = page.locator("#client_id");
    const clientCount = await clientSelect.locator("option").count();
    test.skip(clientCount <= 1, "No clients available in DB");
    await clientSelect.selectOption({ index: 1 });
    await page.selectOption("#priority", "2");
    await page.locator('[data-testid="job-create-form"] button[type="submit"]').click();

    await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+/);
    await expect(page.locator('[data-testid="job-status"]')).toContainText("Draft");

    await page.click('[data-testid="add-visit-btn"]');
    await page.waitForURL(/\/app\/jobs\/[0-9a-f-]+\/visits\/new/);

    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await page.locator('[data-testid="visit-schedule-form"] input[type="date"]').fill(start.toISOString().slice(0, 10));
    await page.locator('[data-testid="visit-schedule-form"] select').first().selectOption("09:00");
    await page.locator('[data-testid="visit-schedule-form"] button[type="submit"]').click();

    await page.waitForURL(/\/app\/visits\/[0-9a-f-]+/);
    await expect(page.locator('[data-testid="visit-status"]')).toContainText("Scheduled");
    await expect(page.locator("h1")).toContainText("Visit");
  });
});

