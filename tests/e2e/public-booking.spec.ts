import { expect, test } from "@playwright/test";

const categories = ["Painting & drywall", "Repairs", "Mounting & installations", "Maintenance", "Custom woodworking"];

test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [390, 1440]) {
  test.describe(`Public booking at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("advertises the agreed services and keeps specialist work out of follow-up choices", async ({ page }) => {
      let submissions = 0;
      await page.route("**/api/booking", async (route) => {
        submissions += 1;
        await route.abort();
      });
      await page.goto("/booking");

      await expect(page.getByRole("heading", { name: "Request service", exact: true })).toBeVisible();
      for (const category of categories) {
        await expect(page.getByRole("button").filter({ has: page.getByText(category, { exact: true }) })).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /Plumbing|Electrical|Outdoor & Seasonal|Specialty Projects/ })).toHaveCount(0);

      await page.getByRole("button").filter({ has: page.getByText("Painting & drywall", { exact: true }) }).click();
      await expect(page.getByText("How many rooms / areas?", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /exterior|both/i })).toHaveCount(0);

      await page.getByRole("button").filter({ has: page.getByText("Maintenance", { exact: true }) }).click();
      await expect(page.getByRole("button", { name: "Lock or door hardware", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /fan|light fixture|faucet|disposal/i })).toHaveCount(0);
      await page.locator("textarea").fill("Review the sticking door and worn weatherstripping.");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Your Contact Info", exact: true })).toBeVisible();
      expect(submissions).toBe(0);
    });
  });
}
