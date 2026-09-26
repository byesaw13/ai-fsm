import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type PoolClient } from "pg";
import { loadReportQueue, REPORT_QUEUE_PARAMS, REPORT_QUEUE_WHERE } from "../queue";

// TASK-163: "Customer reports to send" queue + Needs Attention count.
const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("customer report queue", () => {
  let db: Client;
  let accountId = "";
  let ownerId = "";
  let adminCookie = "";
  const clientId = randomUUID();
  const jobs = {
    eligible: randomUUID(),     // invoiced, after photo
    receiptsOnly: randomUUID(), // finished, but only a receipt photo
    active: randomUUID(),       // still in progress
    skipMe: randomUUID(),
    draftMe: randomUUID(),
    crossAccount: randomUUID(), // its only photo sits on another account's visit
  };
  const otherAccountId = randomUUID();
  const ids = Object.values(jobs);

  const queueIds = async () => (await loadReportQueue(db as unknown as PoolClient, accountId)).map((r) => r.job_id);
  const post = (job: string, body: unknown) =>
    fetch(`${BASE_URL}/api/v1/jobs/${job}/customer-report`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `it-queue-${randomUUID()}` },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    const admin = await db.query<{ id: string; account_id: string }>(`SELECT id, account_id FROM users WHERE email = 'admin@test.com'`);
    accountId = admin.rows[0].account_id;
    ownerId = admin.rows[0].id;

    await db.query(`INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'Queue Client')`, [clientId, accountId]);
    await db.query(`INSERT INTO accounts (id, name) VALUES ($1, 'Other account')`, [otherAccountId]);
    const status: Record<string, string> = { active: "in_progress" };
    for (const [name, id] of Object.entries(jobs)) {
      await db.query(
        `INSERT INTO jobs (id, account_id, client_id, title, status, job_type, created_by)
         VALUES ($1, $2, $3, $4, $5, 'custom', $6)`,
        [id, accountId, clientId, `Queue ${name}`, status[name] ?? "invoiced", ownerId],
      );
      const visitAccount = name === "crossAccount" ? otherAccountId : accountId;
      const v = await db.query<{ id: string }>(
        `INSERT INTO visits (account_id, job_id, scheduled_start, scheduled_end, visit_type, status, completed_at)
         VALUES ($1, $2, now(), now(), 'site_visit', 'completed', now()) RETURNING id`,
        [visitAccount, id],
      );
      await db.query(
        `INSERT INTO visit_media (account_id, visit_id, category, filename, original_name, mime_type, size_bytes, created_by)
         VALUES ($1, $2, $3, 'x.jpg', 'x.jpg', 'image/jpeg', 1, $4)`,
        [visitAccount, v.rows[0].id, name === "receiptsOnly" ? "receipt" : "after", ownerId],
      );
      await db.query(
        `INSERT INTO invoices (account_id, client_id, job_id, invoice_number, status, total_cents, work_summary, created_by)
         VALUES ($1, $2, $3, $4, 'paid', 1000, $5, $6)`,
        [accountId, clientId, id, `Q-${name}-${Date.now()}`, `Summary for ${name}`, ownerId],
      );
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM portal_job_updates WHERE job_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM invoices WHERE job_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM visit_media WHERE visit_id IN (SELECT id FROM visits WHERE job_id = ANY($1::uuid[]))`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM visits WHERE job_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM jobs WHERE id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => undefined);
    await db.query(`DELETE FROM accounts WHERE id = $1`, [otherAccountId]).catch(() => undefined);
    await db.end();
  });

  it("lists only finished jobs with customer photos and no report", async () => {
    const q = await queueIds();
    expect(q).toEqual(expect.arrayContaining([jobs.eligible, jobs.skipMe, jobs.draftMe]));
    expect(q).not.toContain(jobs.receiptsOnly);
    expect(q).not.toContain(jobs.active);
    expect(q).not.toContain(jobs.crossAccount);
  });

  it("skip and publish take a job off; a saved draft stays", async () => {
    expect((await post(jobs.skipMe, { action: "skip" })).status).toBe(200);
    const draft = { title: "Queue draft", summary: "", area: null, work_type: null, media_ids: [], records: [] };
    expect((await post(jobs.draftMe, { action: "save", ...draft })).status).toBe(200);
    expect((await post(jobs.eligible, { action: "publish", ...draft, title: "Queue eligible" })).status).toBe(200);

    const rows = await loadReportQueue(db as unknown as PoolClient, accountId);
    const q = rows.map((r) => r.job_id);
    expect(q).not.toContain(jobs.skipMe);
    expect(q).not.toContain(jobs.eligible);
    expect(rows.find((r) => r.job_id === jobs.draftMe)?.has_draft).toBe(true);

    // Skipping a published report is refused, and the report stays published.
    expect((await post(jobs.eligible, { action: "skip" })).status).toBe(409);
    const kept = await db.query(`SELECT status FROM portal_job_updates WHERE job_id = $1`, [jobs.eligible]);
    expect(kept.rows[0].status).toBe("published");

    // A skipped job reopened later still gets the fresh pre-fill.
    const editor = await fetch(`${BASE_URL}/app/jobs/${jobs.skipMe}/customer-report`, { headers: { Cookie: adminCookie } });
    expect(await editor.text()).toContain("Summary for skipMe");
  }, 60_000);

  it("Needs Attention counts the same jobs as the queue page", async () => {
    const count = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM jobs j WHERE ${REPORT_QUEUE_WHERE}`, REPORT_QUEUE_PARAMS(accountId));
    expect(Number(count.rows[0].count)).toBe((await queueIds()).length);

    const page = await fetch(`${BASE_URL}/app/jobs/customer-reports`, { headers: { Cookie: adminCookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Queue draftMe");
    expect(html).not.toContain("Queue skipMe");
  }, 60_000);
});
