import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Client as PgClient } from "../../apps/web/node_modules/pg";

const { Client } = createRequire(resolve("apps/web/package.json"))("pg") as { Client: typeof PgClient };
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const account = "11111111-1111-1111-1111-111111111111";
const owner = "11111111-1111-1111-1111-aaaaaaaaaaaa";
let db: PgClient;
let clientId: string;
let propertyId: string;
let jobId: string;
let workOrderId: string;
let visitId: string;
let futureId: string;

test.describe("Today and Active Visit", () => {
  test.skip(!databaseUrl || process.env.E2E_SKIP_EMAIL_DELIVERY !== "1", "Requires isolated seeded test database");
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
    clientId = (await db.query("INSERT INTO clients(account_id,name) VALUES($1,'Field design fixture') RETURNING id", [account])).rows[0].id;
    propertyId = (await db.query("INSERT INTO properties(account_id,client_id,address) VALUES($1,$2,'14 Field Test Lane') RETURNING id", [account, clientId])).rows[0].id;
    jobId = (await db.query("INSERT INTO jobs(account_id,client_id,property_id,title,status,job_type,created_by) VALUES($1,$2,$3,'Field design work','in_progress','maintenance',$4) RETURNING id", [account, clientId, propertyId, owner])).rows[0].id;
    workOrderId = (await db.query("INSERT INTO work_orders(account_id,client_id,job_id,title,status,created_by,assigned_user_id) VALUES($1,$2,$3,'Field work packet','ready',$4,$4) RETURNING id", [account, clientId, jobId, owner])).rows[0].id;
    visitId = (await db.query("INSERT INTO visits(account_id,job_id,work_order_id,assigned_user_id,status,scheduled_start,scheduled_end) VALUES($1,$2,$3,$4,'in_progress',now()-interval '1000 days',now()-interval '999 days 23 hours') RETURNING id", [account, jobId, workOrderId, owner])).rows[0].id;
    futureId = (await db.query("INSERT INTO visits(account_id,job_id,work_order_id,assigned_user_id,status,scheduled_start,scheduled_end) VALUES($1,$2,$3,$4,'scheduled',now()+interval '5 days',now()+interval '5 days 1 hour') RETURNING id", [account, jobId, workOrderId, owner])).rows[0].id;
    for (const [index, label] of ["Patch the bedroom", "Paint the closet"].entries()) {
      const task = (await db.query("INSERT INTO work_order_tasks(account_id,work_order_id,label,sort_order) VALUES($1,$2,$3,$4) RETURNING id", [account, workOrderId, label, index])).rows[0].id;
      await db.query("INSERT INTO visit_tasks(account_id,visit_id,task_id) VALUES($1,$2,$3)", [account, visitId, task]);
    }
    await page.goto("/login");
    await page.locator("#email").fill("owner@test.com");
    await page.locator("#password").fill("password");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/app\/my-work/);
  });

  test.afterEach(async () => {
    if (!db) return;
    await db.query("DELETE FROM visits WHERE job_id=$1", [jobId]);
    await db.query("DELETE FROM work_orders WHERE job_id=$1", [jobId]);
    await db.query("DELETE FROM invoices WHERE job_id=$1", [jobId]);
    await db.query("DELETE FROM estimates WHERE job_id=$1", [jobId]);
    await db.query("DELETE FROM jobs WHERE id=$1", [jobId]);
    await db.query("DELETE FROM properties WHERE id=$1", [propertyId]);
    await db.query("DELETE FROM clients WHERE id=$1", [clientId]);
    await db.end();
  });

  test("active carry-over stays available independently of day setup; future work stays off Today", async ({ page }, testInfo) => {
    await expect(page.getByTestId("hero-continue")).toBeVisible();
    await expect(page.getByTestId("next-visit-hero")).toContainText("14 Field Test Lane");
    await expect(page.locator(`.field-today-list a[href='/app/visits/${futureId}']`)).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("today-mobile.png"), fullPage: true });
    await page.getByTestId("hero-continue").click();
    await expect(page.locator("h1")).toHaveText("14 Field Test Lane");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });

  test("notes open directly, survive interruption and failed saves, and retry on the existing API", async ({ page }) => {
    await page.goto(`/app/visits/${visitId}`);
    await page.getByRole("button", { name: "Note", exact: true }).click();
    const sheet = page.getByTestId("visit-tool-sheet");
    await sheet.getByTestId("visit-notes-input").fill("Draft survives interruption");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Note", exact: true })).toBeFocused();
    await page.reload();
    await page.getByRole("button", { name: "Note", exact: true }).click();
    await expect(sheet.getByTestId("visit-notes-input")).toHaveValue("Draft survives interruption");
    await page.route(`**/api/v1/visits/${visitId}`, async route => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 503, json: { error: { message: "Temporary save failure" } } });
      else await route.continue();
    });
    await sheet.getByTestId("save-notes-btn").click();
    await expect(sheet.getByRole("alert")).toContainText("Temporary save failure");
    await expect(sheet.getByTestId("visit-notes-input")).toHaveValue("Draft survives interruption");
    await page.unroute(`**/api/v1/visits/${visitId}`);
    await sheet.getByTestId("save-notes-btn").click();
    await expect(sheet.getByTestId("notes-saved-msg")).toBeVisible();
    expect((await db.query("SELECT tech_notes FROM visits WHERE id=$1", [visitId])).rows[0].tech_notes).toBe("Draft survives interruption");
    expect(await page.getByTestId("visit-field-record").evaluate(el => (el as HTMLDetailsElement).open)).toBe(false);
  });

  test("partial work creates a remainder, advances the next task, and never implies drying", async ({ page }) => {
    await page.goto(`/app/visits/${visitId}`);
    await page.getByRole("button", { name: "Started, not finished", exact: true }).click();
    await page.getByTestId("visit-tool-sheet").getByLabel("What is left to do?").fill("Sand the bedroom patch");
    await page.getByRole("button", { name: "Save partial progress" }).click();
    await expect(page.getByTestId("visit-tool-sheet")).not.toBeVisible();
    await expect(page.getByTestId("visit-first-up")).toContainText("Paint the closet");
    await expect(page.getByText("While that dries", { exact: true })).toHaveCount(0);
    const tasks = (await db.query("SELECT label,status,parent_task_id FROM work_order_tasks WHERE work_order_id=$1", [workOrderId])).rows;
    expect(tasks.find(t => t.label === "Patch the bedroom")?.status).toBe("partial");
    expect(tasks.find(t => t.label === "Sand the bedroom patch")?.parent_task_id).toBeTruthy();
    await page.getByTestId("visit-first-up").getByRole("button", { name: "Complete task" }).click();
    await expect(page.getByTestId("visit-first-up")).toContainText("Sand the bedroom patch");
  });

  test("return closeout retains its draft and keeps the job open without ending the day", async ({ page }) => {
    await page.goto(`/app/visits/${visitId}`);
    await page.getByRole("button", { name: "Finish visit", exact: true }).click();
    await page.getByTestId("completion-mark-complete").click();
    await page.getByTestId("closeout-kind-return").click();
    await page.getByTestId("closeout-today-notes").fill("Prepared and patched the bedroom");
    await page.getByTestId("closeout-first-up").fill("Sand and paint the bedroom");
    await page.getByTestId("closeout-next-unsure").click();
    await page.getByTestId("closeout-wizard").getByRole("button", { name: "Close dialog" }).click();
    await page.getByTestId("completion-mark-complete").click();
    await expect(page.getByTestId("closeout-today-notes")).toHaveValue("Prepared and patched the bedroom");
    const initialPayroll = (await db.query("SELECT count(*)::int AS n FROM time_clock_sessions WHERE user_id=$1 AND clock_out_at IS NULL", [owner])).rows[0].n;
    if (!initialPayroll) expect((await page.request.post("/api/v1/time-clock/clock-in")).ok()).toBe(true);
    const payrollBefore = (await db.query("SELECT count(*)::int AS n FROM time_clock_sessions WHERE user_id=$1 AND clock_out_at IS NULL", [owner])).rows[0]?.n;
    await page.getByTestId("closeout-submit").click();
    await expect(page.getByTestId("visit-status")).toHaveText("Done");
    expect((await db.query("SELECT status FROM jobs WHERE id=$1", [jobId])).rows[0].status).toBe("in_progress");
    expect((await db.query("SELECT closeout_kind FROM visits WHERE id=$1", [visitId])).rows[0].closeout_kind).toBe("return");
    expect((await db.query("SELECT count(*)::int AS n FROM time_clock_sessions WHERE user_id=$1 AND clock_out_at IS NULL", [owner])).rows[0]?.n).toBe(payrollBefore);
    await expect(page.getByRole("button", { name: "Finish visit", exact: true })).toHaveCount(0);
    if (!initialPayroll) expect((await page.request.post("/api/v1/time-clock/clock-out")).ok()).toBe(true);
  });
  test("photos and materials use the existing records; whole-job closeout holds its bill", async ({ page }, testInfo) => {
    const estimate = (await db.query("INSERT INTO estimates(account_id,client_id,job_id,status,subtotal_cents,total_cents,created_by) VALUES($1,$2,$3,'approved',25000,25000,$4) RETURNING id", [account, clientId, jobId, owner])).rows[0].id;
    await db.query("INSERT INTO estimate_line_items(estimate_id,description,quantity,unit_price_cents,total_cents) VALUES($1,'Patch and paint the bedroom',1,25000,25000)", [estimate]);
    await page.goto(`/app/visits/${visitId}`);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ5kAAAAASUVORK5CYII=", "base64");
    const before = await page.request.post(`/api/v1/visits/${visitId}/media`, { multipart: { category: "before", file: { name: "before.png", mimeType: "image/png", buffer: png } } });
    expect(before.ok()).toBe(true);
    await page.reload();
    await expect(page.getByTestId("before-you-leave").getByRole("button", { name: "Completion photos Add" })).toBeVisible();
    await page.getByTestId("visit-face-photo-input").setInputFiles({ name: "after.png", mimeType: "image/png", buffer: png });
    await expect(page.getByTestId("before-you-leave").getByRole("button", { name: "Completion photos Recorded" })).toBeVisible();
    await page.getByRole("button", { name: "Materials", exact: true }).click();
    const sheet = page.getByTestId("visit-tool-sheet");
    await sheet.getByTestId("need-material-input").fill("Primer for the return visit");
    await sheet.getByRole("button", { name: "Need material", exact: true }).click();
    await expect(sheet.getByTestId("materials-needed-text")).toContainText("Primer for the return visit");
    await sheet.getByTestId("materials-used-textarea").fill("Joint compound and tape");
    await sheet.getByRole("button", { name: "Save materials" }).click();
    await expect.poll(async () => (await db.query("SELECT materials_used FROM visits WHERE id=$1", [visitId])).rows[0].materials_used).toBe("Joint compound and tape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("before-you-leave").getByRole("button", { name: "Materials used Recorded" })).toBeVisible();
    while (await page.getByRole("button", { name: "Dismiss notification" }).count()) await page.getByRole("button", { name: "Dismiss notification" }).first().click();
    await page.screenshot({ path: testInfo.outputPath("active-visit-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: testInfo.outputPath("active-visit-desktop.png"), fullPage: true });
    await page.getByTestId("visit-first-up").getByRole("button", { name: "Complete task" }).click();
    await expect(page.getByTestId("visit-first-up")).toContainText("Paint the closet");
    await page.getByTestId("visit-first-up").getByRole("button", { name: "Complete task" }).click();
    await page.getByRole("button", { name: "Finish visit", exact: true }).first().click();
    await expect(page.getByTestId("completion-checklist-panel")).toContainText("after.png");
    await page.getByText("Client signature waived", { exact: true }).click();
    await page.getByTestId("completion-mark-complete").click();
    await page.getByTestId("closeout-kind-done").click();
    await page.getByTestId("closeout-today-notes").fill("Patched and painted the bedroom");
    await page.getByTestId("closeout-hold").click();
    await expect(page.getByTestId("visit-status")).toHaveText("Done");
    expect((await db.query("SELECT status FROM jobs WHERE id=$1", [jobId])).rows[0].status).toBe("completed");
    const bills = (await db.query("SELECT status FROM invoices WHERE job_id=$1", [jobId])).rows;
    expect(bills.length).toBeGreaterThan(0);
    expect(bills.every(bill => bill.status === "draft")).toBe(true);
  });

  test("opening an untouched note never restores a stale copy over added work", async ({ page }) => {
    await page.goto(`/app/visits/${visitId}`);
    await page.getByRole("button", { name: "Note", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add work", exact: true }).click();
    await page.getByTestId("visit-tool-sheet").getByLabel("What did you find?").fill("Replace the closet trim");
    await page.getByRole("button", { name: "Save as a note" }).click();
    await expect.poll(async () => (await db.query("SELECT tech_notes FROM visits WHERE id=$1", [visitId])).rows[0].tech_notes).toContain("Replace the closet trim");
    await expect(page.getByRole("button", { name: "Save as a note" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Note", exact: true }).click();
    await expect(page.getByTestId("visit-notes-input")).toHaveValue(/Replace the closet trim/);
  });

  test("a failed planner load cannot clear existing planned tasks", async ({ page }) => {
    await page.goto(`/app/visits/${visitId}`);
    await page.route(`**/api/v1/visits/${visitId}/tasks?selectable=1`, route => route.fulfill({ status: 503, json: { error: { message: "Task load failed" } } }));
    await page.getByRole("button", { name: "Edit today’s plan" }).click();
    const sheet = page.getByTestId("visit-tool-sheet");
    await expect(sheet.getByRole("alert")).toContainText("Task load failed");
    await expect(sheet.getByRole("button", { name: "Save day plan" })).toBeDisabled();
    expect((await db.query("SELECT count(*)::int AS n FROM visit_tasks WHERE visit_id=$1", [visitId])).rows[0].n).toBe(2);
    await page.unroute(`**/api/v1/visits/${visitId}/tasks?selectable=1`);
    await sheet.getByRole("button", { name: "Retry loading tasks" }).click();
    await expect(sheet.getByRole("button", { name: "Save day plan" })).toBeEnabled();
    await expect(sheet.getByLabel("Patch the bedroom", { exact: true })).toBeChecked();
  });

  test("existing completion and recording deep links still open their tools", async ({ page }) => {
    await page.goto(`/app/visits/${visitId}#visit-completion`);
    await expect(page.getByTestId("completion-checklist-panel")).toBeVisible();
    await page.goto(`/app/visits/${visitId}#visit-notes`);
    await expect(page.getByTestId("visit-tool-sheet").getByTestId("visit-notes-form")).toBeVisible();
  });

});
