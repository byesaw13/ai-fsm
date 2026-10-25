/**
 * Multi-option approval guard (TASK-181).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * A Good/Better/Best estimate cannot be approved without the customer's pick;
 * with it, the pick is saved and totals and deposit follow that option.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("multi-option approval guard", () => {
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

  /** A sent Good/Better estimate with a 30% deposit; returns ids and the portal token. */
  async function sentMultiOption() {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      presentation_mode: "multi_option",
      deposit_required: true,
      deposit_type: "percentage",
      deposit_percentage: 30,
      options: [
        { label: "Good", sort_order: 0, line_items: [{ description: "Paint walls", quantity: 1, unit_price_cents: 200_000 }] },
        {
          label: "Better", sort_order: 1, is_recommended: true,
          line_items: [
            { description: "Paint walls and trim", quantity: 1, unit_price_cents: 420_000 },
            { description: "Paint", quantity: 1, unit_price_cents: 80_000, line_item_type: "materials" },
          ],
        },
      ],
    });
    const id = data.id as string;
    const token = randomUUID();
    await db(`UPDATE estimates SET status = 'sent', share_token = $1 WHERE id = $2`, [token, id]);
    const options = await db<{ id: string; label: string }>(`SELECT id, label FROM estimate_options WHERE estimate_id = $1`, [id]);
    return { id, token, better: options.find((o) => o.label === "Better")!.id };
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-option-choice" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Option choice test" })).data?.data?.id;
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("portal: refuses approval without a pick, then records it with the deposit from the option", async () => {
    const { id, token, better } = await sentMultiOption();
    const approve = { action: "approve", name: "Pat Customer", signature_svg: "<svg/>" };

    const refused = await api("POST", `/api/portal/estimates/${token}`, approve, false);
    expect(refused.status).toBe(422);
    expect((await db<{ status: string }>(`SELECT status FROM estimates WHERE id = $1`, [id]))[0].status).toBe("sent");

    const ok = await api("POST", `/api/portal/estimates/${token}`, { ...approve, option_id: better }, false);
    expect(ok.status).toBe(200);
    const [est] = await db<{ status: string; selected_option_id: string; deposit_cents: number; balance_cents: number }>(
      `SELECT status, selected_option_id, deposit_cents, balance_cents FROM estimates WHERE id = $1`,
      [id],
    );
    expect(est).toMatchObject({ status: "approved", selected_option_id: better, deposit_cents: 150_000, balance_cents: 350_000 });
    // The deposit invoice created on approval carries the option's deposit (what TASK-182 will send).
    const deposit = await db<{ total_cents: number }>(`SELECT total_cents FROM invoices WHERE estimate_id = $1 AND invoice_kind = 'deposit'`, [id]);
    expect(deposit.map((d) => d.total_cents)).toEqual([150_000]);
  });

  it("owner approval needs the customer's pick", async () => {
    const { id, better } = await sentMultiOption();
    const refused = await api("POST", `/api/v1/estimates/${id}/transition`, { status: "approved" });
    expect(refused.status).toBe(400);
    expect(refused.data.error.code).toBe("OPTION_REQUIRED");

    const ok = await api("POST", `/api/v1/estimates/${id}/transition`, { status: "approved", option_id: better });
    expect(ok.status).toBe(200);
    const [est] = await db<{ selected_option_id: string; deposit_cents: number }>(
      `SELECT selected_option_id, deposit_cents FROM estimates WHERE id = $1`,
      [id],
    );
    expect(est).toEqual({ selected_option_id: better, deposit_cents: 150_000 });
  });

  it("a standard estimate still approves without any option", async () => {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [{ description: "Fix door", quantity: 1, unit_price_cents: 15_000 }],
    });
    await db(`UPDATE estimates SET status = 'sent' WHERE id = $1`, [data.id]);
    const ok = await api("POST", `/api/v1/estimates/${data.id}/transition`, { status: "approved" });
    expect(ok.status).toBe(200);
  });
});
