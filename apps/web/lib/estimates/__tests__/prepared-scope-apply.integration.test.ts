/**
 * Apply to quote round trip (TASK-179 slice 3).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * Seeds a draft with a prepared scope, applies it, saves the edit form with an
 * owner line, applies again, and checks line types, groups, owner lines and
 * totals survive.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import type { PreparedScope } from "@ai-fsm/domain";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("prepared scope Apply to quote", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let clientId = "";
  let estimateId = "";

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

  async function lines() {
    return db<{ description: string; line_item_type: string; prepared_group_key: string | null; total_cents: number }>(
      `SELECT description, line_item_type, prepared_group_key, total_cents
       FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order`,
      [estimateId],
    );
  }

  const scope: PreparedScope = {
    version: 1,
    source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
    groups: [{ key: "bath", label: "Bathroom" }],
    tasks: [
      {
        id: "t1", room_id: null, description: "Paint ceiling", kind: "requested", confirmed: true, group_key: "bath",
        quantity_key: null, count: null, quantity: null,
        hours_low: 2, hours_high: 3, hours_source: "ai_allowance", materials_cents: 4000,
      },
    ],
    questions: [],
    alternatives: [],
    exclusions: [],
  };

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-prepared-scope-apply" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Prepared scope apply test" })).data?.data?.id;
    estimateId = (await api("POST", "/api/v1/estimates", { client_id: clientId, line_items: [] })).data?.id;
    await db(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(scope), estimateId]);
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("apply builds typed, grouped lines from the scope", async () => {
    const res = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, { prepared_scope: scope, apply: true });
    expect(res.status).toBe(200);
    expect(await lines()).toEqual([
      expect.objectContaining({ line_item_type: "labor", prepared_group_key: "bath" }),
      expect.objectContaining({ line_item_type: "materials", prepared_group_key: "bath", total_cents: 4000 }),
    ]);
  });

  it("an edit-form save keeps line types and groups and adds an owner line", async () => {
    const current = await db<{ description: string; quantity: string; unit_price_cents: number; line_item_type: string; prepared_group_key: string | null }>(
      `SELECT description, quantity, unit_price_cents, line_item_type, prepared_group_key
       FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order`,
      [estimateId],
    );
    const payload = [
      ...current.map((l, i) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price_cents: l.unit_price_cents,
        sort_order: i,
        line_item_type: l.line_item_type,
        prepared_group_key: l.prepared_group_key,
      })),
      { description: "Haul-away", quantity: 1, unit_price_cents: 7500, sort_order: current.length },
    ];
    const res = await api("PATCH", `/api/v1/estimates/${estimateId}`, { client_id: clientId, tax_rate: 0, line_items: payload });
    expect(res.status).toBe(200);
    expect((await lines()).map((l) => [l.line_item_type, l.prepared_group_key])).toEqual([
      ["labor", "bath"],
      ["materials", "bath"],
      ["labor", null],
    ]);
  });

  it("applying again replaces only prepared lines and keeps the owner line once", async () => {
    const edited = structuredClone(scope);
    edited.tasks[0].hours_high = 5; // mid 3.5 h
    const res = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, { prepared_scope: edited, apply: true });
    expect(res.status).toBe(200);
    const after = await lines();
    expect(after.map((l) => l.description)).toEqual([
      "Bathroom — labor, est. 2–5 h",
      "Bathroom — materials allowance",
      "Haul-away",
    ]);
    const [{ total_cents }] = await db<{ total_cents: number }>(`SELECT total_cents FROM estimates WHERE id = $1`, [estimateId]);
    expect(total_cents).toBe(after.reduce((s, l) => s + l.total_cents, 0));
  });

  it("fixed price: total equals the price, flat-rate lane, internal cost from expected hours, notes written", async () => {
    const fixed: PreparedScope = {
      ...structuredClone(scope),
      pricing: { mode: "fixed", fixed_price_cents: 60_000, expected_hours: 4, overhead_cents: 0, reserve_pct: 0 },
    };
    const res = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, { prepared_scope: fixed, apply: true });
    expect(res.status).toBe(200);
    const [est] = await db<{ total_cents: number; pricing_mode: string; internal_labor_cost_cents: number; internal_material_cost_cents: number; notes: string | null }>(
      `SELECT total_cents, pricing_mode, internal_labor_cost_cents, internal_material_cost_cents, notes FROM estimates WHERE id = $1`,
      [estimateId],
    );
    const settingsRows = await db<{ labor_cost_cents_per_hour: number }>(
      `SELECT labor_cost_cents_per_hour FROM business_pricing_settings bps JOIN estimates e ON e.account_id = bps.account_id WHERE e.id = $1`,
      [estimateId],
    );
    const labor_cost_cents_per_hour = settingsRows[0]?.labor_cost_cents_per_hour ?? 5000; // default when no settings row
    expect(est.pricing_mode).toBe("flat_rate");
    expect(est.total_cents).toBe(60_000 + 7500); // fixed price plus the owner's haul-away line
    expect(est.internal_labor_cost_cents).toBe(4 * labor_cost_cents_per_hour);
    expect(est.internal_material_cost_cents).toBe(4000);
    expect(est.notes).toMatch(/^What's included[\s\S]*Pricing: fixed price of \$600 for the work above\.$/);
  });

  it("a sent quote can no longer be changed from its scope", async () => {
    await db(`UPDATE estimates SET status = 'sent' WHERE id = $1`, [estimateId]);
    const res = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, { prepared_scope: scope, apply: true });
    expect(res.status).toBe(422);
  });
});
