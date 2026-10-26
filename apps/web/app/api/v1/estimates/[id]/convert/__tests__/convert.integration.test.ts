/**
 * Convert copies only the approved lines, and those lines add up (TASK-196).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("estimate convert integrity", () => {
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

  async function approve(estimateId: string) {
    await db(`UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1`, [estimateId]);
    const res = await api("POST", `/api/v1/estimates/${estimateId}/transition`, { status: "approved" });
    expect(res.status).toBe(200);
  }

  async function invoiceOf(invoiceId: string) {
    const [invoice] = await db<{
      subtotal_cents: number;
      tax_cents: number;
      total_cents: number;
      deposit_cents: number;
    }>(
      `SELECT subtotal_cents, tax_cents, total_cents, deposit_cents FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    const lines = await db<{ description: string; total_cents: number }>(
      `SELECT description, total_cents FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order, created_at`,
      [invoiceId],
    );
    return { invoice, lines };
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-convert-integrity" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Convert integrity test" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("folds hidden lines into Included work and the lines equal the subtotal", async () => {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [
        { description: "Paint the door", quantity: 1, unit_price_cents: 10_000 },
        { description: "Internal primer note", quantity: 1, unit_price_cents: 3_000, visible_to_customer: false },
        { description: "Internal caulk note", quantity: 1, unit_price_cents: 2_000, visible_to_customer: false },
      ],
    });
    await approve(data.id);
    const converted = await api("POST", `/api/v1/estimates/${data.id}/convert`);
    expect(converted.status).toBe(201);
    const { invoice, lines } = await invoiceOf(converted.data.invoice_id);
    expect(lines.map((row) => row.description)).toEqual(["Paint the door", "Included work"]);
    expect(lines.reduce((sum, row) => sum + Number(row.total_cents), 0)).toBe(Number(invoice.subtotal_cents));
    expect(Number(invoice.subtotal_cents)).toBe(15_000);

    const again = await api("POST", `/api/v1/estimates/${data.id}/convert`);
    expect(again.status).toBe(200);
    expect(again.data.created).toBe(false);
    expect(again.data.invoice_id).toBe(converted.data.invoice_id);
  });

  it("adds a risk adjustment line so the lines equal the subtotal", async () => {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      risk_adjustment_cents: 4_000,
      line_items: [{ description: "Fix hinge", quantity: 1, unit_price_cents: 10_000 }],
    });
    await approve(data.id);
    const converted = await api("POST", `/api/v1/estimates/${data.id}/convert`);
    expect(converted.status).toBe(201);
    const { invoice, lines } = await invoiceOf(converted.data.invoice_id);
    expect(lines.map((row) => row.description)).toEqual(["Fix hinge", "Risk adjustment"]);
    expect(lines.reduce((sum, row) => sum + Number(row.total_cents), 0)).toBe(Number(invoice.subtotal_cents));
    expect(Number(invoice.subtotal_cents)).toBe(14_000);
  });

  it("adds a travel line when there is a surcharge and no snapshot", async () => {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      travel_surcharge_cents: 2_500,
      line_items: [{ description: "Fix hinge", quantity: 1, unit_price_cents: 10_000 }],
    });
    await approve(data.id);
    const converted = await api("POST", `/api/v1/estimates/${data.id}/convert`);
    expect(converted.status).toBe(201);
    const { invoice, lines } = await invoiceOf(converted.data.invoice_id);
    expect(lines.map((row) => row.description)).toEqual(["Fix hinge", "Travel"]);
    expect(lines.reduce((sum, row) => sum + Number(row.total_cents), 0)).toBe(Number(invoice.subtotal_cents));
    expect(Number(invoice.subtotal_cents)).toBe(12_500);
  });

  it("copies only the chosen Better lines, and they equal the invoice subtotal", async () => {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      presentation_mode: "multi_option",
      deposit_required: true,
      deposit_type: "percentage",
      deposit_percentage: 30,
      options: [
        { label: "Good", sort_order: 0, line_items: [{ description: "Paint walls", quantity: 1, unit_price_cents: 200_000 }] },
        {
          label: "Better",
          sort_order: 1,
          is_recommended: true,
          line_items: [
            { description: "Paint walls and trim", quantity: 1, unit_price_cents: 420_000 },
            { description: "Paint", quantity: 1, unit_price_cents: 80_000, line_item_type: "materials" },
          ],
        },
      ],
    });
    const options = await db<{ id: string; label: string }>(
      `SELECT id, label FROM estimate_options WHERE estimate_id = $1`,
      [data.id],
    );
    const better = options.find((row) => row.label === "Better")!.id;
    await db(`UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1`, [data.id]);
    const approved = await api("POST", `/api/v1/estimates/${data.id}/transition`, { status: "approved", option_id: better });
    expect(approved.status).toBe(200);

    const converted = await api("POST", `/api/v1/estimates/${data.id}/convert`);
    expect(converted.status).toBe(201);
    const { invoice, lines } = await invoiceOf(converted.data.invoice_id);
    expect(lines.map((row) => row.description)).toEqual(["Paint walls and trim", "Paint"]);
    expect(lines.reduce((sum, row) => sum + Number(row.total_cents), 0)).toBe(Number(invoice.subtotal_cents));
    expect(Number(invoice.subtotal_cents)).toBe(500_000);
    expect(Number(invoice.total_cents)).toBe(500_000);
    expect(Number(invoice.deposit_cents)).toBe(150_000);
  });

  it("refuses a multi-option estimate with no chosen option", async () => {
    const { data } = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      presentation_mode: "multi_option",
      options: [
        { label: "Good", sort_order: 0, line_items: [{ description: "Paint walls", quantity: 1, unit_price_cents: 200_000 }] },
        { label: "Better", sort_order: 1, line_items: [{ description: "Paint walls and trim", quantity: 1, unit_price_cents: 420_000 }] },
      ],
    });
    await db(`UPDATE estimates SET status = 'approved' WHERE id = $1`, [data.id]);
    const refused = await api("POST", `/api/v1/estimates/${data.id}/convert`);
    expect(refused.status).toBe(422);
    expect(refused.data.error.code).toBe("OPTION_REQUIRED");
    expect(refused.data.error.message).toBe("Choose the customer's option first");
    const finals = await db<{ id: string }>(
      `SELECT id FROM invoices WHERE estimate_id = $1 AND invoice_kind = 'final'`,
      [data.id],
    );
    expect(finals).toEqual([]);
  });
});
