import { test, expect } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Guided Store Run mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  let clientId: string | null;
  let jobId: string | null;
  let jobTitle: string;

  test.beforeEach(async ({ page }) => {
    clientId = null;
    jobId = null;
    jobTitle = `Test Store Run Job ${Date.now()}`;

    await page.goto(`${BASE}/login`);
    await page.fill('[id="email"]', "owner@test.com");
    await page.fill('[id="password"]', "password");
    await page.click('[type="submit"]');
    await page.waitForURL(/\/app\/my-(?:day|work)/);

    const clientResponse = await page.request.post(`${BASE}/api/v1/clients`, {
      data: { name: `Store Run Client ${Date.now()}` },
    });
    expect(clientResponse.ok()).toBe(true);
    clientId = (await clientResponse.json()).data.id;

    const jobResponse = await page.request.post(`${BASE}/api/v1/jobs`, {
      data: { client_id: clientId, title: jobTitle },
    });
    expect(jobResponse.ok()).toBe(true);
    jobId = (await jobResponse.json()).data.id;

    for (const [name, aisle] of [["Lumber", "4"], ["Fasteners", "13"]]) {
      const lineResponse = await page.request.post(`${BASE}/api/v1/jobs/${jobId}/materials`, {
        data: { name, quantity: 1, store_section: name },
      });
      expect(lineResponse.ok()).toBe(true);
      const lineId = (await lineResponse.json()).data.id;
      const locationResponse = await page.request.patch(
        `${BASE}/api/v1/jobs/${jobId}/materials/${lineId}`,
        { data: { supplier: "Home Depot", aisle, bay: null } },
      );
      expect(locationResponse.ok()).toBe(true);
    }
  });

  test.afterEach(async ({ page }) => {
    if (jobId) await page.request.delete(`${BASE}/api/v1/jobs/${jobId}`);
    if (clientId) await page.request.delete(`${BASE}/api/v1/clients/${clientId}`);
  });

  test("purchases by department and opens receipt with the job selected", async ({ page }) => {
    await page.goto(`${BASE}/app/jobs`);
    await page.getByRole("link", { name: jobTitle }).click();
    await expect(page.getByRole("heading", { name: jobTitle })).toBeVisible();
    const openedJobId = jobId!;
    await page.goto(`${BASE}/app/jobs/${openedJobId}/materials`);

    await page.getByTestId("start-store-run").click();
    await page.getByTestId("store-run-supplier").selectOption({ label: "Home Depot" });
    await page.getByTestId("store-run-begin").click();

    await page.locator('[data-testid^="store-run-item-"]').first().click();
    await expect(page.getByTestId("store-run-next")).toBeVisible();
    await page.getByTestId("store-run-next").click();
    await page.locator('[data-testid^="store-run-item-"]').first().click();
    await page.getByTestId("store-run-finish").click();

    await page.getByTestId("store-run-upload-receipt").click();
    await expect(page).toHaveURL(new RegExp(`/app/expenses/new\\?mode=run&job=${openedJobId}`));
    // Expense Select uses id="job_id" (no name attribute)
    await expect(page.locator("select#job_id")).toHaveValue(openedJobId!);
  });
});
