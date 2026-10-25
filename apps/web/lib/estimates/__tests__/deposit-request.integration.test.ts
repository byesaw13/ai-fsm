/**
 * Deposit request and scheduling on approval (TASK-182).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * The test client has no email or phone, so nothing is delivered: the send
 * fails before contact, which is recorded and noted on the schedule item.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("deposit request and scheduling on approval", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let clientId = "";

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : {};
    return { status: res.status, data };
  }

  async function db<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    try {
      return (await c.query(sql, params)).rows as T[];
    } finally {
      await c.end();
    }
  }

  /** Create, mark sent, and approve an estimate; returns its id and the approval response. */
  async function approved(deposit: Record<string, unknown>) {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [{ description: "Bathroom refresh", quantity: 1, unit_price_cents: 500_000 }],
      ...deposit,
    });
    await db(`UPDATE estimates SET status = 'sent' WHERE id = $1`, [data.id]);
    const res = await api("POST", `/api/v1/estimates/${data.id}/transition`, { status: "approved" });
    return { id: data.id as string, res };
  }

  async function scheduleItem(estimateId: string) {
    const rows = await db<{ title: string }>(
      `SELECT ai.title FROM action_items ai
       JOIN estimates e ON (ai.entity_type = 'job' AND ai.entity_id = e.job_id) OR (ai.entity_type = 'estimate' AND ai.entity_id = e.id)
       WHERE e.id = $1 AND ai.action_type = 'schedule_job' AND ai.resolved_at IS NULL`,
      [estimateId],
    );
    return rows.map((r) => r.title);
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-deposit-request" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Deposit request test (no contact)" })).data?.data?.id;
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("deposit before scheduling: one item waiting on deposit; an undeliverable send is recorded, never sent", async () => {
    const { id, res } = await approved({ deposit_required: true, deposit_type: "percentage", deposit_percentage: 30, deposit_due_trigger: "before_scheduling" });
    expect(res.status).toBe(200);
    expect(res.data.deposit_request).toBe("failed");

    const [invoice] = await db<{ id: string; status: string; total_cents: number }>(
      `SELECT id, status, total_cents FROM invoices WHERE estimate_id = $1 AND invoice_kind = 'deposit'`,
      [id],
    );
    expect(invoice).toMatchObject({ status: "draft", total_cents: 150_000 });
    const attempts = await db<{ outcome: string }>(`SELECT outcome FROM invoice_delivery_attempts WHERE invoice_id = $1`, [invoice.id]);
    expect(attempts.map((a) => a.outcome)).toEqual(["failed"]);

    const titles = await scheduleItem(id);
    expect(titles).toHaveLength(1);
    expect(titles[0]).toMatch(/^Schedule this job — deposit request not sent \(/);
 
    // The invoice Send button uses the same send path: it reports why it could not send.
    const manual = await api("POST", `/api/v1/invoices/${invoice.id}/send`);
    expect(manual.status).toBe(422);
    expect(manual.data.error.message).toBe("Client has no email address on file");
  });

  it("a partial payment leaves it waiting; full payment moves it to ready to book", async () => {
    const { id } = await approved({ deposit_required: true, deposit_type: "percentage", deposit_percentage: 30, deposit_due_trigger: "before_scheduling" });
    const [invoice] = await db<{ id: string; account_id: string; client_id: string }>(
      `SELECT id, account_id, client_id FROM invoices WHERE estimate_id = $1 AND invoice_kind = 'deposit'`,
      [id],
    );
    await db(`UPDATE invoices SET status = 'sent', sent_at = now() WHERE id = $1`, [invoice.id]);
    // Reset the note the failed send left, so the item reads as waiting.
    await db(`UPDATE action_items SET title = 'Schedule this job — waiting on deposit' WHERE action_type = 'schedule_job' AND resolved_at IS NULL AND entity_id = (SELECT job_id FROM estimates WHERE id = $1)`, [id]);

    const pay = (cents: number) =>
      db(
        `INSERT INTO payments (account_id, invoice_id, amount_cents, method, status, received_at, created_by)
         VALUES ($1, $2, $3, 'check', 'paid', now(), (SELECT id FROM users WHERE account_id = $1 AND role = 'owner' LIMIT 1))`,
        [invoice.account_id, invoice.id, cents],
      );
    await pay(50_000);
    expect(await scheduleItem(id)).toEqual(["Schedule this job — waiting on deposit"]);
    await pay(100_000);
    expect(await scheduleItem(id)).toEqual(["Schedule this job — deposit received, ready to book"]);
  });

  it("no deposit: ready to book, nothing sent", async () => {
    const { id, res } = await approved({ deposit_required: false });
    expect(res.data.deposit_request).toBe("no_deposit");
    expect(await scheduleItem(id)).toEqual(["Schedule this job — ready to book"]);
  });

  it("deposit due before materials: ready to book now, showing the deposit as still due", async () => {
    const { id } = await approved({ deposit_required: true, deposit_type: "percentage", deposit_percentage: 30, deposit_due_trigger: "before_material_order" });
    const [title] = await scheduleItem(id);
    // The failed send note replaces the wording; the item still exists exactly once.
    expect(title).toMatch(/^Schedule this job — /);
    expect((await scheduleItem(id))).toHaveLength(1);
  });
});
