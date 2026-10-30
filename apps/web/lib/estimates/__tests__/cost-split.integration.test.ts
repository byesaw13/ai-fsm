/**
 * Itemized labor and materials cost (TASK-190).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * Fixture A is the hourly baseline: 110.25 labor hours and $1,450 of materials.
 * Hours are sent and used for cost. TASK-191 stores them; this test checks the costs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { quoteStamp } from "./quote-stamp";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

const FIXTURE_A_HOURS = [12.5, 16.75, 2.5, 10, 9, 8.5, 16, 35];
const FIXTURE_A_MATERIAL_CENTS = [30_000, 29_500, 22_500, 63_000];

function fixtureALines(extra: Record<string, unknown>[] = []) {
  const labor = FIXTURE_A_HOURS.map((hours, i) => ({
    description: `Area ${i + 1} labor`,
    quantity: 1,
    unit_price_cents: Math.round(hours * 8500),
    hours_high: hours,
    line_item_type: "labor",
    sort_order: i,
  }));
  const materials = FIXTURE_A_MATERIAL_CENTS.map((cents, i) => ({
    description: `Area materials ${i + 1}`,
    quantity: 1,
    unit_price_cents: cents,
    unit_cost_cents: cents,
    line_item_type: "materials",
    sort_order: labor.length + i,
  }));
  return [...labor, ...materials, ...extra.map((line, i) => ({ sort_order: labor.length + materials.length + i, ...line }))];
}

describe.skipIf(!RUN)("itemized internal cost split", () => {
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

  async function createEstimate(line_items: unknown[]) {
    const res = await api("POST", "/api/v1/estimates", { client_id: clientId, line_items });
    expect(res.status).toBe(201);
    return res.data.id as string;
  }

  async function costs(estimateId: string) {
    const [row] = await db<{ internal_labor_cost_cents: number; internal_material_cost_cents: number }>(
      `SELECT internal_labor_cost_cents, internal_material_cost_cents FROM estimates WHERE id = $1`,
      [estimateId],
    );
    return row;
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-190" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Materials cost split test" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
    const rates = await db<{ labor_cost_cents_per_hour: number }>(
      `SELECT labor_cost_cents_per_hour
       FROM business_pricing_settings bps
       JOIN clients c ON c.account_id = bps.account_id
       WHERE c.id = $1`,
      [clientId],
    );
    const costRate = rates[0]?.labor_cost_cents_per_hour ?? 5000;
    expect(costRate).toBe(5000);
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("stores fixture A labor at the cost rate and materials at the entered cost", async () => {
    const id = await createEstimate(fixtureALines());
    expect(await costs(id)).toEqual({
      internal_labor_cost_cents: 551_250,
      internal_material_cost_cents: 145_000,
    });
  });

  it("a real handling line changes neither cost and is not doubled", async () => {
    const id = await createEstimate(fixtureALines([
      {
        description: "Material handling",
        quantity: 1,
        unit_price_cents: 21_750,
        line_item_type: "handling_fee",
      },
    ]));
    expect(await costs(id)).toEqual({
      internal_labor_cost_cents: 551_250,
      internal_material_cost_cents: 145_000,
    });
    const handling = await db<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM estimate_line_items
       WHERE estimate_id = $1 AND line_item_type = 'handling_fee'`,
      [id],
    );
    expect(handling[0]?.count).toBe("1");
  });

  it("prices a materials line from its cost when no price is sent", async () => {
    const id = await createEstimate([
      {
        description: "Primer",
        quantity: 1,
        unit_cost_cents: 20_000,
        line_item_type: "materials",
        sort_order: 0,
      },
    ]);
    const lines = await db<{ unit_price_cents: number; unit_cost_cents: number }>(
      `SELECT unit_price_cents, unit_cost_cents FROM estimate_line_items WHERE estimate_id = $1`,
      [id],
    );
    expect(lines).toEqual([{ unit_price_cents: 20_000, unit_cost_cents: 20_000 }]);
  });

  it("keeps a materials cost that is below the customer price", async () => {
    const id = await createEstimate([
      {
        description: "Paint",
        quantity: 1,
        unit_price_cents: 24_000,
        unit_cost_cents: 20_000,
        line_item_type: "materials",
        sort_order: 0,
      },
    ]);
    const lines = await db<{ unit_cost_cents: number }>(
      `SELECT unit_cost_cents FROM estimate_line_items WHERE estimate_id = $1`,
      [id],
    );
    expect(lines[0]?.unit_cost_cents).toBe(20_000);
    expect((await costs(id)).internal_material_cost_cents).toBe(20_000);
  });

  it("a later edit keeps the cost and scales it by quantity", async () => {
    const id = await createEstimate([
      {
        description: "Paint",
        quantity: 1,
        unit_price_cents: 24_000,
        unit_cost_cents: 20_000,
        line_item_type: "materials",
        sort_order: 0,
      },
    ]);
    const res = await api("PATCH", `/api/v1/estimates/${id}`, {
      client_id: clientId,
      tax_rate: 0,
      updated_at: await quoteStamp(id),
      line_items: [
        {
          description: "Paint",
          quantity: 2,
          unit_price_cents: 24_000,
          unit_cost_cents: 20_000,
          line_item_type: "materials",
          sort_order: 0,
        },
      ],
    });
    expect(res.status).toBe(200);
    const lines = await db<{ quantity: string; unit_price_cents: number; unit_cost_cents: number }>(
      `SELECT quantity, unit_price_cents, unit_cost_cents FROM estimate_line_items WHERE estimate_id = $1`,
      [id],
    );
    expect(Number(lines[0]?.quantity)).toBe(2);
    expect(lines[0]?.unit_price_cents).toBe(24_000);
    expect(lines[0]?.unit_cost_cents).toBe(20_000);
    expect((await costs(id)).internal_material_cost_cents).toBe(40_000);
  });
});
