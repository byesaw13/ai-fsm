import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// TASK-162: Job Reports — publish rules, public page, photo scoping, withdraw.
const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("job reports", () => {
  let db: Client;
  let accountId = "";
  let ownerId = "";
  let adminCookie = "";
  const clientId = randomUUID();
  const realtorId = randomUUID();
  const propertyId = randomUUID();
  const jobId = randomUUID();
  const bareJobId = randomUUID();
  const sponsoredJobId = randomUUID();
  const visitId = randomUUID();
  const sponsoredVisitId = randomUUID();
  const media = { after: randomUUID(), before: randomUUID(), receipt: randomUUID(), sponsoredAfter: randomUUID() };
  let url = "";

  const post = (job: string, body: unknown) =>
    fetch(`${BASE_URL}/api/v1/jobs/${job}/customer-report`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const content = (ids: string[]) => ({
    title: "Hall & stairway repaint",
    summary: "Patched the plaster and painted.",
    area: "interior_paint",
    work_type: "improvement",
    media_ids: ids,
    records: [{ label: "Hall walls", detail: "BM White Dove, eggshell" }, { label: " ", detail: "" }],
  });
  const tokenOf = (u: string) => u.split("/").at(-1)!;

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `it-reports-${randomUUID()}` },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    const admin = await db.query<{ id: string; account_id: string }>(
      `SELECT id, account_id FROM users WHERE email = 'admin@test.com'`,
    );
    accountId = admin.rows[0].account_id;
    ownerId = admin.rows[0].id;

    await db.query(`INSERT INTO clients (id, account_id, name) VALUES ($1, $3, 'Report Homeowner'), ($2, $3, 'Report Realtor')`, [clientId, realtorId, accountId]);
    await db.query(`INSERT INTO properties (id, account_id, client_id, name, address) VALUES ($1, $2, $3, '12 Maple St', '12 Maple St')`, [propertyId, accountId, clientId]);
    await db.query(
      `INSERT INTO jobs (id, account_id, client_id, property_id, title, status, job_type, created_by) VALUES
       ($1, $4, $5, $6, 'Hall repaint', 'completed', 'painting', $7),
       ($2, $4, $5, $6, 'No invoice yet', 'completed', 'custom', $7),
       ($3, $4, $8, $6, 'Listing prep', 'completed', 'custom', $7)`,
      [jobId, bareJobId, sponsoredJobId, accountId, clientId, propertyId, ownerId, realtorId],
    );
    await db.query(
      `INSERT INTO visits (id, account_id, job_id, scheduled_start, scheduled_end, visit_type, status) VALUES
       ($1, $3, $4, now(), now() + interval '1 hour', 'site_visit', 'completed'),
       ($2, $3, $5, now(), now() + interval '1 hour', 'site_visit', 'completed')`,
      [visitId, sponsoredVisitId, accountId, jobId, sponsoredJobId],
    );
    await db.query(
      `INSERT INTO visit_media (id, account_id, visit_id, category, filename, original_name, mime_type, size_bytes, created_by) VALUES
       ($1, $5, $6, 'after',   'a.jpg', 'a.jpg', 'image/jpeg', 1, $8),
       ($2, $5, $6, 'before',  'b.jpg', 'b.jpg', 'image/jpeg', 1, $8),
       ($3, $5, $6, 'receipt', 'r.jpg', 'r.jpg', 'image/jpeg', 1, $8),
       ($4, $5, $7, 'after',   's.jpg', 's.jpg', 'image/jpeg', 1, $8)`,
      [media.after, media.before, media.receipt, media.sponsoredAfter, accountId, visitId, sponsoredVisitId, ownerId],
    );
    await db.query(
      `INSERT INTO invoices (account_id, client_id, job_id, property_id, invoice_number, status, total_cents, created_by)
       VALUES ($1, $2, $3, $4, $5, 'sent', 50000, $6)`,
      [accountId, clientId, jobId, propertyId, `JR-${Date.now()}`, ownerId],
    );
    await db.query(
      `INSERT INTO invoices (account_id, client_id, job_id, property_id, invoice_number, status, total_cents,
                             billing_context, sponsored_purpose, created_by)
       VALUES ($1, $2, $3, $4, $5, 'sent', 30000, 'realtor_sponsored', 'pre_listing', $6)`,
      [accountId, realtorId, sponsoredJobId, propertyId, `JRS-${Date.now()}`, ownerId],
    );
  });

  afterAll(async () => {
    if (!db) return;
    const jobs = [jobId, bareJobId, sponsoredJobId];
    await db.query(`DELETE FROM portal_job_updates WHERE job_id = ANY($1::uuid[])`, [jobs]).catch(() => undefined);
    await db.query(`DELETE FROM invoices WHERE job_id = ANY($1::uuid[])`, [jobs]).catch(() => undefined);
    await db.query(`DELETE FROM visit_media WHERE visit_id = ANY($1::uuid[])`, [[visitId, sponsoredVisitId]]).catch(() => undefined);
    await db.query(`DELETE FROM visits WHERE job_id = ANY($1::uuid[])`, [jobs]).catch(() => undefined);
    await db.query(`DELETE FROM jobs WHERE id = ANY($1::uuid[])`, [jobs]).catch(() => undefined);
    await db.query(`DELETE FROM properties WHERE id = $1`, [propertyId]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[clientId, realtorId]]).catch(() => undefined);
    await db.end();
  });

  it("staff only; needs a billed invoice; photos must be this job's customer photos", async () => {
    const anon = await fetch(`${BASE_URL}/api/v1/jobs/${jobId}/customer-report`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", ...content([]) }),
    });
    expect(anon.status).toBe(401);
    expect((await post(bareJobId, { action: "publish", ...content([]) })).status).toBe(409);
    expect((await post(jobId, { action: "publish", ...content([media.receipt]) })).status).toBe(400);
    expect((await post(jobId, { action: "publish", ...content([media.sponsoredAfter]) })).status).toBe(400);
  }, 60_000);

  it("a draft is not public; publishing makes the report reachable", async () => {
    const draft = await post(jobId, { action: "save", ...content([media.after]) });
    expect(draft.status).toBe(200);
    const row = await db.query<{ share_token: string; status: string }>(
      `SELECT share_token::text, status FROM portal_job_updates WHERE job_id = $1`, [jobId],
    );
    expect(row.rows[0].status).toBe("draft");
    expect((await fetch(`${BASE_URL}/portal/reports/${row.rows[0].share_token}`)).status).toBe(404);

    const res = await post(jobId, { action: "publish", ...content([media.after]) });
    expect(res.status).toBe(200);
    url = (await res.json()).url;
    const stored = await db.query(`SELECT records, client_id::text FROM portal_job_updates WHERE job_id = $1`, [jobId]);
    expect(stored.rows[0].records).toEqual([{ label: "Hall walls", detail: "BM White Dove, eggshell" }]);
    expect(stored.rows[0].client_id).toBe(clientId);

    const page = await fetch(`${BASE_URL}/portal/reports/${tokenOf(url)}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await page.text();
    expect(html).toContain("Hall &amp; stairway repaint");
    expect(html).toContain("BM White Dove, eggshell");
  }, 60_000);

  it("counts customer views, not staff views", async () => {
    await fetch(`${BASE_URL}/portal/reports/${tokenOf(url)}`, { headers: { Cookie: adminCookie } });
    const before = await db.query<{ view_count: number }>(`SELECT view_count FROM portal_job_updates WHERE job_id = $1`, [jobId]);
    await fetch(`${BASE_URL}/portal/reports/${tokenOf(url)}`);
    const after = await db.query<{ view_count: number }>(`SELECT view_count FROM portal_job_updates WHERE job_id = $1`, [jobId]);
    expect(after.rows[0].view_count).toBe(before.rows[0].view_count + 1);
  }, 60_000);

  it("serves only the chosen photos", async () => {
    const photo = (id: string) => fetch(`${BASE_URL}/api/portal/reports/${tokenOf(url)}/media/${id}`);
    // Chosen photo passes the access check (the file itself isn't on this test disk).
    expect(await (await photo(media.after)).json()).toEqual({ error: "File missing" });
    for (const id of [media.before, media.receipt, media.sponsoredAfter]) {
      const res = await photo(id);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
  }, 60_000);

  it("withdraw kills the link; republishing issues a new one", async () => {
    expect((await post(jobId, { action: "withdraw" })).status).toBe(200);
    expect((await fetch(`${BASE_URL}/portal/reports/${tokenOf(url)}`)).status).toBe(404);
    const again = await post(jobId, { action: "publish", ...content([media.after]) });
    const newUrl = (await again.json()).url;
    expect(tokenOf(newUrl)).not.toBe(tokenOf(url));
    expect((await fetch(`${BASE_URL}/portal/reports/${tokenOf(newUrl)}`)).status).toBe(200);
  }, 60_000);

  it("a realtor-paid job goes to the realtor without records items", async () => {
    const res = await post(sponsoredJobId, { action: "publish", ...content([media.sponsoredAfter]) });
    expect(res.status).toBe(200);
    const row = await db.query(
      `SELECT client_id::text, sponsored, records FROM portal_job_updates WHERE job_id = $1`, [sponsoredJobId],
    );
    expect(row.rows[0]).toEqual({ client_id: realtorId, sponsored: true, records: [] });
    const html = await (await fetch(`${BASE_URL}/portal/reports/${tokenOf((await res.json()).url)}`)).text();
    expect(html).not.toContain("Keep for your records");
  }, 60_000);
});
