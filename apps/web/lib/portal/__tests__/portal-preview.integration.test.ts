import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// TASK-160: staff "view as client" preview is short-lived and read-only.
const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("admin portal preview", () => {
  let db: Client;
  let adminCookie = "";
  let previewCookie = "";
  let accountId = "";
  let ownerId = "";
  const clientId = randomUUID();
  const invoiceId = randomUUID();
  const estimateId = randomUUID();
  const otherClientId = randomUUID();
  const otherEstimateId = randomUUID();
  let otherEstimateShare = "";
  let portalToken = "";
  let invoiceShare = "";
  let estimateShare = "";

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `it-preview-${randomUUID()}` },
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
    const c = await db.query<{ portal_token: string }>(
      `INSERT INTO clients (id, account_id, name, sms_consent) VALUES ($1, $2, 'Preview Client', true)
       RETURNING portal_token::text`,
      [clientId, accountId],
    );
    portalToken = c.rows[0].portal_token;
    const inv = await db.query<{ share_token: string }>(
      `INSERT INTO invoices (id, account_id, client_id, invoice_number, status, total_cents, created_by)
       VALUES ($1, $2, $3, $4, 'sent', 5000, $5) RETURNING share_token::text`,
      [invoiceId, accountId, clientId, `PV-${Date.now()}`, ownerId],
    );
    invoiceShare = inv.rows[0].share_token;
    const est = await db.query<{ share_token: string }>(
      `INSERT INTO estimates (id, account_id, client_id, status, total_cents, created_by)
       VALUES ($1, $2, $3, 'sent', 5000, $4) RETURNING share_token::text`,
      [estimateId, accountId, clientId, ownerId],
    );
    estimateShare = est.rows[0].share_token;
    await db.query(`INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'Other Client')`, [otherClientId, accountId]);
    const other = await db.query<{ share_token: string }>(
      `INSERT INTO estimates (id, account_id, client_id, status, total_cents, created_by)
       VALUES ($1, $2, $3, 'sent', 5000, $4) RETURNING share_token::text`,
      [otherEstimateId, accountId, otherClientId, ownerId],
    );
    otherEstimateShare = other.rows[0].share_token;
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM portal_sessions WHERE client_id = $1`, [clientId]).catch(() => undefined);
    await db.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]).catch(() => undefined);
    await db.query(`DELETE FROM estimates WHERE id = ANY($1::uuid[])`, [[estimateId, otherEstimateId]]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[clientId, otherClientId]]).catch(() => undefined);
    await db.end();
  });

  it("requires a staff session", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/portal-preview/${clientId}`, { redirect: "manual" });
    expect(res.status).toBe(401);
  });

  it("creates a short-lived preview session, not a real client login", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/portal-preview/${clientId}`, {
      headers: { Cookie: adminCookie },
      redirect: "manual",
    });
    expect([302, 307]).toContain(res.status);
    previewCookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
    expect(previewCookie).toMatch(/^portal_session=/);

    const row = await db.query<{ is_preview: boolean; hours: number }>(
      `SELECT is_preview, extract(epoch FROM expires_at - now()) / 3600 AS hours
       FROM portal_sessions WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );
    expect(row.rows[0].is_preview).toBe(true);
    expect(Number(row.rows[0].hours)).toBeLessThanOrEqual(2);

    const page = await fetch(`${BASE_URL}/portal/${portalToken}`, { headers: { Cookie: previewCookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Admin Preview Mode");
    expect(html).toContain("/api/v1/admin/portal-preview/exit");
  }, 60_000);

  it("blocks client actions while previewing", async () => {
    const headers = { Cookie: previewCookie, "Content-Type": "application/json" };
    const sms = await fetch(`${BASE_URL}/api/portal/${portalToken}/sms-opt-out`, { method: "POST", headers });
    expect(sms.status).toBe(403);
    const pay = await fetch(`${BASE_URL}/api/portal/invoices/${invoiceShare}`, { method: "POST", headers, body: "{}" });
    expect(pay.status).toBe(403);
    const respond = await fetch(`${BASE_URL}/api/portal/estimates/${estimateShare}`, {
      method: "POST", headers, body: JSON.stringify({ action: "decline" }),
    });
    expect(respond.status).toBe(403);

    const state = await db.query<{ sms_consent: boolean; est_status: string }>(
      `SELECT c.sms_consent, e.status AS est_status FROM clients c JOIN estimates e ON e.client_id = c.id WHERE c.id = $1`,
      [clientId],
    );
    expect(state.rows[0]).toEqual({ sms_consent: true, est_status: "sent" });
  }, 60_000);

  it("only restricts the previewed client's documents", async () => {
    const res = await fetch(`${BASE_URL}/api/portal/estimates/${otherEstimateShare}`, {
      method: "POST",
      headers: { Cookie: previewCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    });
    expect(res.status).not.toBe(403);
  }, 60_000);

  it("does not mark an invoice opened when staff view it", async () => {
    for (const cookie of [previewCookie, adminCookie]) {
      const page = await fetch(`${BASE_URL}/portal/invoices/${invoiceShare}`, { headers: { Cookie: cookie } });
      expect(page.status).toBe(200);
    }
    const inv = await db.query<{ first_viewed_at: string | null; view_count: number }>(
      `SELECT first_viewed_at, view_count FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(inv.rows[0].first_viewed_at).toBeNull();
    expect(Number(inv.rows[0].view_count ?? 0)).toBe(0);
  }, 60_000);

  it("exit ends the preview login", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/portal-preview/exit?client=${clientId}`, {
      headers: { Cookie: `${adminCookie}; ${previewCookie}` },
      redirect: "manual",
    });
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toContain(`/app/clients/${clientId}`);
    const left = await db.query(`SELECT 1 FROM portal_sessions WHERE client_id = $1 AND is_preview`, [clientId]);
    expect(left.rowCount).toBe(0);
  }, 60_000);
});
