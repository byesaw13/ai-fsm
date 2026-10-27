/**
 * Person-hours stored on create and edit (TASK-191).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * Hours do not change the customer price. A blank hour stays null.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("stored person-hours", () => {
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
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-191" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Person hours test" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("keeps a blank labor hour null and the price unchanged", async () => {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [{
        description: "Labor",
        quantity: 1,
        unit_price_cents: 11_500,
        line_item_type: "labor",
        sort_order: 0,
      }],
    });
    expect(res.status).toBe(201);
    const lines = await db<{ hours_low: string | null; hours_high: string | null; hours_source: string | null; total_cents: number }>(
      `SELECT hours_low::text, hours_high::text, hours_source, total_cents
       FROM estimate_line_items WHERE estimate_id = $1`,
      [res.data.id],
    );
    expect(lines).toEqual([{
      hours_low: null,
      hours_high: null,
      hours_source: null,
      total_cents: 11_500,
    }]);
  });

  it("stores a 6 to 8 hour range with its source", async () => {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [{
        description: "On site",
        quantity: 1,
        unit_price_cents: 11_500,
        hours_low: 6,
        hours_high: 8,
        hours_source: "owner",
        line_item_type: "labor",
        sort_order: 0,
      }],
    });
    expect(res.status).toBe(201);
    const lines = await db<{ hours_low: string; hours_high: string; hours_source: string; total_cents: number }>(
      `SELECT hours_low::text, hours_high::text, hours_source, total_cents
       FROM estimate_line_items WHERE estimate_id = $1`,
      [res.data.id],
    );
    expect(Number(lines[0]?.hours_low)).toBe(6);
    expect(Number(lines[0]?.hours_high)).toBe(8);
    expect(lines[0]?.hours_source).toBe("owner");
    expect(lines[0]?.total_cents).toBe(11_500);
  });

  it("stores a flat quote range on the estimate, not as a line", async () => {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      flat_rate_cents: 50_000,
      labor_hours_low: 20,
      labor_hours_high: 30,
      labor_hours_source: "owner",
    });
    expect(res.status).toBe(201);
    const [row] = await db<{ labor_hours_low: string; labor_hours_high: string; labor_hours_source: string; total_cents: number }>(
      `SELECT labor_hours_low::text, labor_hours_high::text, labor_hours_source, total_cents
       FROM estimates WHERE id = $1`,
      [res.data.id],
    );
    expect(Number(row?.labor_hours_low)).toBe(20);
    expect(Number(row?.labor_hours_high)).toBe(30);
    expect(row?.labor_hours_source).toBe("owner");
    expect(row?.total_cents).toBe(50_000);
    const lines = await db<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM estimate_line_items WHERE estimate_id = $1`,
      [res.data.id],
    );
    expect(lines[0]?.count).toBe("0");
  });

  it("clears stored hours back to null on edit", async () => {
    const created = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [{
        description: "On site",
        quantity: 1,
        unit_price_cents: 11_500,
        hours_low: 6,
        hours_high: 8,
        hours_source: "owner",
        line_item_type: "labor",
        sort_order: 0,
      }],
    });
    expect(created.status).toBe(201);
    const patched = await api("PATCH", `/api/v1/estimates/${created.data.id}`, {
      client_id: clientId,
      tax_rate: 0,
      line_items: [{
        description: "On site",
        quantity: 1,
        unit_price_cents: 11_500,
        hours_low: null,
        hours_high: null,
        hours_source: null,
        line_item_type: "labor",
        sort_order: 0,
      }],
    });
    expect(patched.status).toBe(200);
    const lines = await db<{ hours_low: string | null; hours_high: string | null; hours_source: string | null; total_cents: number }>(
      `SELECT hours_low::text, hours_high::text, hours_source, total_cents
       FROM estimate_line_items WHERE estimate_id = $1`,
      [created.data.id],
    );
    expect(lines).toEqual([{
      hours_low: null,
      hours_high: null,
      hours_source: null,
      total_cents: 11_500,
    }]);
  });
});
