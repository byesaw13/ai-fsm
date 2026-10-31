/**
 * Customer ticks add-ons when approving (TASK-225).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * A sent prepared quote with priced options: approving with one ticked records
 * it, the deposit follows base + add-on, the quote total stays the base, and
 * the final bill adds the add-on as its own line.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("add-on approval", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let clientId = "";

  async function api(method: string, path: string, body?: unknown, withCookie = true) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(withCookie ? { Cookie: cookie } : {}) },
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

  /** A sent $5,000 quote with a 30% deposit and two options, one priced. */
  async function sentWithOptions() {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      deposit_required: true,
      deposit_type: "percentage",
      deposit_percentage: 30,
      line_items: [{ description: "Paint the foyer", quantity: 1, unit_price_cents: 500_000 }],
    });
    const id = data.id as string;
    const scope = {
      version: 1,
      source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
      groups: [], tasks: [], questions: [], exclusions: [],
      alternatives: [
        { id: "a1", label: "Trim touch-ups", task_ids: [], note: null, price_cents: null },
        { id: "a2", label: "Foyer stairwell", task_ids: [], note: "Same space", price_cents: 105_000 },
      ],
    };
    const token = randomUUID();
    await db(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(scope), id]);
    await db(`UPDATE estimates SET status = 'sent', share_token = $1 WHERE id = $2`, [token, id]);
    return { id, token };
  }

  const approve = { action: "approve", name: "Pat Customer", signature_svg: "<svg/>" };

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-add-on-choice" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Add-on choice test" })).data?.data?.id;
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("records the ticked add-on, the deposit follows it, and the final bill adds its line", async () => {
    const { id, token } = await sentWithOptions();
    const ok = await api("POST", `/api/portal/estimates/${token}`, { ...approve, add_on_ids: ["a2"] }, false);
    expect(ok.status).toBe(200);

    const [est] = await db<{ status: string; total_cents: number; deposit_cents: number; balance_cents: number; approved_add_ons: unknown }>(
      `SELECT status, total_cents, deposit_cents, balance_cents, approved_add_ons FROM estimates WHERE id = $1`,
      [id],
    );
    expect(est).toMatchObject({ status: "approved", total_cents: 500_000, deposit_cents: 181_500, balance_cents: 423_500 });
    expect(est.approved_add_ons).toEqual([{ id: "a2", label: "Foyer stairwell", price_cents: 105_000 }]);

    // The crew's work order lists the add-on (Codex review on #741).
    const criteria = await db<{ completion_criteria: { label: string }[] }>(
      `SELECT wo.completion_criteria FROM work_orders wo WHERE wo.source_estimate_id = $1`,
      [id],
    );
    expect(criteria).toHaveLength(1);
    expect(criteria[0].completion_criteria.map((c) => c.label)).toContain("Foyer stairwell (added option)");

    const converted = await api("POST", `/api/v1/estimates/${id}/convert`);
    expect(converted.status).toBeLessThan(300);
    const [bill] = await db<{ id: string; subtotal_cents: number; total_cents: number }>(
      `SELECT id, subtotal_cents, total_cents FROM invoices WHERE estimate_id = $1 AND invoice_kind = 'final'`,
      [id],
    );
    expect(bill).toMatchObject({ subtotal_cents: 605_000, total_cents: 605_000 });
    const lines = await db<{ description: string; total_cents: number }>(
      `SELECT description, total_cents FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [bill.id],
    );
    expect(lines.map((l) => [l.description, l.total_cents])).toEqual([
      ["Paint the foyer", 500_000],
      ["Foyer stairwell (added option)", 105_000],
    ]);
  });

  it("approving with nothing ticked behaves as before", async () => {
    const { id, token } = await sentWithOptions();
    expect((await api("POST", `/api/portal/estimates/${token}`, approve, false)).status).toBe(200);
    const [est] = await db<{ deposit_cents: number; approved_add_ons: unknown }>(
      `SELECT deposit_cents, approved_add_ons FROM estimates WHERE id = $1`,
      [id],
    );
    expect(est).toEqual({ deposit_cents: 150_000, approved_add_ons: null });
  });

  it("refuses an add-on without a price or not on the quote", async () => {
    const { id, token } = await sentWithOptions();
    const refused = await api("POST", `/api/portal/estimates/${token}`, { ...approve, add_on_ids: ["a1"] }, false);
    expect(refused.status).toBe(422);
    expect((await db<{ status: string }>(`SELECT status FROM estimates WHERE id = $1`, [id]))[0].status).toBe("sent");
  });
});
