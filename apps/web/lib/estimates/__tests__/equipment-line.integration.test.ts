/**
 * Equipment is its own line (TASK-192).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * A $120 equipment line stays out of the materials cost. Convert keeps the type.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("equipment line type", () => {
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

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-192" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Equipment line test" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("stores equipment apart from materials and copies the type onto the invoice", async () => {
    const created = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [
        {
          description: "Paint materials",
          quantity: 1,
          unit_price_cents: 10_000,
          unit_cost_cents: 10_000,
          line_item_type: "materials",
          sort_order: 0,
        },
        {
          description: "Lift rental materials",
          quantity: 1,
          unit_price_cents: 12_000,
          unit_cost_cents: 12_000,
          line_item_type: "equipment",
          sort_order: 1,
        },
      ],
    });
    expect(created.status).toBe(201);

    const [costs] = await db<{ internal_material_cost_cents: number }>(
      `SELECT internal_material_cost_cents FROM estimates WHERE id = $1`,
      [created.data.id],
    );
    expect(costs.internal_material_cost_cents).toBe(10_000);

    const estimateLines = await db<{ description: string; line_item_type: string }>(
      `SELECT description, line_item_type FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order`,
      [created.data.id],
    );
    expect(estimateLines).toEqual([
      { description: "Paint materials", line_item_type: "materials" },
      { description: "Lift rental materials", line_item_type: "equipment" },
    ]);

    await db(`UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1`, [created.data.id]);
    const approved = await api("POST", `/api/v1/estimates/${created.data.id}/transition`, { status: "approved" });
    expect(approved.status).toBe(200);
    const converted = await api("POST", `/api/v1/estimates/${created.data.id}/convert`);
    expect(converted.status).toBe(201);

    const invoiceLines = await db<{ description: string; line_item_type: string; total_cents: number }>(
      `SELECT description, line_item_type, total_cents
         FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order, created_at`,
      [converted.data.invoice_id],
    );
    expect(invoiceLines).toEqual([
      { description: "Paint materials", line_item_type: "materials", total_cents: 10_000 },
      { description: "Lift rental materials", line_item_type: "equipment", total_cents: 12_000 },
    ]);
  });
});
