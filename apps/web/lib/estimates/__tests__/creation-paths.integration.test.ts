/**
 * Hours survive every estimate creation path (TASK-191 / TASK-188).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * CI applies migrations, including 209, before this file runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { sqftPaintingToSpec, type PreparedScope } from "@ai-fsm/domain";
import { rowToLineItemPayload } from "../form-helpers";
import { finalizeTmDraft } from "../tm-briefing";
import {
  formHourColumns,
  priceBookHourRange,
  withHourEdit,
} from "../stored-hours";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("creation paths store person-hours", () => {
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

  async function lineHours(estimateId: string) {
    return db<{
      description: string;
      line_item_type: string;
      hours_low: string | null;
      hours_high: string | null;
      hours_source: string | null;
      total_cents: number;
      option_id: string | null;
    }>(
      `SELECT description, line_item_type, hours_low::text, hours_high::text, hours_source, total_cents, option_id
       FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order, created_at`,
      [estimateId],
    );
  }

  async function estimateHours(estimateId: string) {
    const rows = await db<{
      labor_hours_low: string | null;
      labor_hours_high: string | null;
      labor_hours_source: string | null;
      baseline_snapshot: unknown;
      direct_costs_confirmed_at: string | null;
      total_cents: number;
      subtotal_cents: number;
    }>(
      `SELECT labor_hours_low::text, labor_hours_high::text, labor_hours_source,
              baseline_snapshot, direct_costs_confirmed_at, total_cents, subtotal_cents
       FROM estimates WHERE id = $1`,
      [estimateId],
    );
    return rows[0];
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-191-paths" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Creation path hours" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("1. Apply to quote stores Fixture A as 87.75 to 132.25 person-hours", async () => {
    const areas = [
      ["protection", "Protection, setup and general prep", 9, 16, 30000],
      ["bedroom", "Bedroom", 13.25, 20.25, 29500],
      ["pantry", "Pantry", 2, 3, null],
      ["kitchen", "Kitchen", 8, 12, null],
      ["office", "Office", 7.5, 10.25, 22500],
      ["hall", "Hall", 7, 10, null],
      ["foyer", "Foyer", 12, 20, null],
      ["living", "Living room", 29, 40.75, 63000],
    ] as const;
    const scope: PreparedScope = {
      version: 1,
      source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
      groups: areas.map(([key, label]) => ({ key, label })),
      tasks: areas.map(([key, label, low, high, materials]) => ({
        id: key,
        room_id: null,
        description: label,
        kind: "requested" as const,
        confirmed: true,
        group_key: key,
        quantity_key: null,
        count: null,
        quantity: null,
        hours_low: low,
        hours_high: high,
        hours_source: "ai_allowance" as const,
        materials_cents: materials,
      })),
      questions: [],
      alternatives: [],
      exclusions: [],
    };
    const created = await api("POST", "/api/v1/estimates", { client_id: clientId, line_items: [] });
    expect(created.status).toBe(201);
    await db(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(scope), created.data.id]);
    const applied = await api("PUT", `/api/v1/estimates/${created.data.id}/prepared-scope`, {
      prepared_scope: scope,
      apply: true,
    });
    expect(applied.status).toBe(200);
    const sums = await db<{ low: string; high: string }>(
      `SELECT SUM(hours_low)::text AS low, SUM(hours_high)::text AS high
       FROM estimate_line_items
       WHERE estimate_id = $1 AND line_item_type = 'labor'`,
      [created.data.id],
    );
    expect(Number(sums[0].low)).toBe(87.75);
    expect(Number(sums[0].high)).toBe(132.25);
  });

  it("2. an itemized form row keeps the typed range", async () => {
    const payload = rowToLineItemPayload({
      description: "Hang shelves",
      quantity: "1",
      unit_price: "115.00",
      line_item_type: "labor",
      hours_low: "2",
      hours_high: "3",
      hours_source: "owner",
    }, 0);
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [payload],
    });
    expect(res.status).toBe(201);
    const lines = await lineHours(res.data.id);
    expect(lines[0]).toMatchObject({ hours_low: "2.00", hours_high: "3.00", hours_source: "owner", total_cents: 11500 });
  });

  it("3. a flat quote saves 20 to 30 hours on the estimate", async () => {
    const hours = formHourColumns({ hours_low: "20", hours_high: "30", hours_source: "owner" });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      flat_rate_cents: 50000,
      line_items: [],
      labor_hours_low: hours.hours_low,
      labor_hours_high: hours.hours_high,
      labor_hours_source: hours.hours_source,
    });
    expect(res.status).toBe(201);
    const estimate = await estimateHours(res.data.id);
    expect(estimate).toMatchObject({
      labor_hours_low: "20.00",
      labor_hours_high: "30.00",
      labor_hours_source: "owner",
      total_cents: 50000,
    });
    expect(await lineHours(res.data.id)).toEqual([]);
  });

  it("4. a painting quote stores the submitted hours and keeps the customer total", async () => {
    const spec = sqftPaintingToSpec({
      sq_ft: 200,
      prep_level: 3,
      includes_trim: false,
      includes_ceiling: false,
      material_cost_cents: 0,
      labor_hours_estimate: 6,
    });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      sq_ft: 200,
      prep_level: 3,
      labor_hours_estimate: 6,
      material_cost_cents: 0,
      line_items: [{
        description: "Painting labor — 200 sq ft",
        quantity: 1,
        unit_price_cents: 100,
        line_item_type: "labor",
        hours_low: 6,
        hours_high: 6,
        hours_source: "owner",
      }],
      engine_spec: spec,
    });
    expect(res.status).toBe(201);
    const lines = await lineHours(res.data.id);
    const labor = lines.filter((line) => line.line_item_type === "labor");
    expect(labor.length).toBeGreaterThan(0);
    expect(labor.every((line) => line.hours_low === "6.00" && line.hours_high === "6.00" && line.hours_source === "owner")).toBe(true);
    const estimate = await estimateHours(res.data.id);
    const lineSum = lines.reduce((sum, line) => sum + line.total_cents, 0);
    expect(estimate.total_cents).toBe(lineSum);
    expect(labor[0].total_cents).not.toBe(100);
  });

  it("4b. a painting total is stored on one labor line when materials add another", async () => {
    const spec = sqftPaintingToSpec({
      sq_ft: 200,
      prep_level: 3,
      includes_trim: false,
      includes_ceiling: false,
      material_cost_cents: 5000,
      labor_hours_estimate: 6,
    });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      sq_ft: 200,
      prep_level: 3,
      labor_hours_estimate: 6,
      material_cost_cents: 5000,
      line_items: [
        { description: "Painting labor", quantity: 1, unit_price_cents: 100, line_item_type: "labor" },
        { description: "Materials", quantity: 1, unit_price_cents: 5000, line_item_type: "materials" },
      ],
      engine_spec: spec,
    });
    expect(res.status).toBe(201);
    const lines = await lineHours(res.data.id);
    const labor = lines.filter((line) => line.line_item_type === "labor");
    expect(labor.length).toBeGreaterThan(1);
    const withHours = lines.filter((line) => line.hours_low != null || line.hours_high != null);
    expect(withHours).toHaveLength(1);
    expect(withHours[0]).toMatchObject({
      line_item_type: "labor",
      hours_low: "6.00",
      hours_high: "6.00",
      hours_source: "owner",
    });
    expect(withHours[0].total_cents).toBeGreaterThan(0);
  });

  it("5. a price-book draft stores the book's hour range", async () => {
    const hours = priceBookHourRange({ labor_hours_low: 1, labor_hours_high: 3, labor_hours_typical: 2 });
    expect(hours).toEqual({ hours_low: 1, hours_high: 3, hours_source: "price_book" });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [{
        description: "Price book labor",
        quantity: 1,
        unit_price_cents: 8000,
        line_item_type: "labor",
        ...hours,
      }],
    });
    expect(res.status).toBe(201);
    expect((await lineHours(res.data.id))[0]).toMatchObject({
      hours_low: "1.00",
      hours_high: "3.00",
      hours_source: "price_book",
      total_cents: 8000,
    });
  });

  it("6. a T&M briefing stores 6 to 8 hours as an allowance, and an edit makes them the owner's", async () => {
    const draft = finalizeTmDraft({
      recommended_mode: "time_and_materials",
      mode_rationale: "test",
      location_city: null,
      location_state: "NH",
      location_notes: null,
      scope_summary: "Hang a shelf",
      scope_items: [],
      labor_hours_min: 6,
      labor_hours_max: 8,
      travel_hours_min: 0,
      travel_hours_max: 0,
      working_days: null,
      trip_count: "one_trip",
      materials: [],
      materials_policy: "",
      risks: [],
      customer_notes: "",
      internal_notes: "",
      proposal_summary: "",
      confidence: "high",
      confidence_notes: "",
      schedule_notes: "",
      difficult_access: false,
      old_house_risk: false,
      requires_drying_or_curing: false,
      coordination_required: false,
      finish_expectation: "clean",
      pasted_rate_cents: null,
    });
    const labor = draft.line_items.find((line) => line.line_item_type === "labor");
    expect(labor).toMatchObject({ hours_low: 6, hours_high: 8, hours_source: "ai_allowance" });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: draft.line_items.map((line, index) => ({ ...line, sort_order: index })),
    });
    expect(res.status).toBe(201);
    const before = (await lineHours(res.data.id))[0];
    expect(before).toMatchObject({
      hours_low: "6.00",
      hours_high: "8.00",
      hours_source: "ai_allowance",
    });
    const row = {
      description: labor!.description,
      quantity: String(labor!.quantity),
      unit_price: (labor!.unit_price_cents / 100).toFixed(2),
      line_item_type: "labor" as const,
      hours_low: "6",
      hours_high: "8",
      hours_source: "ai_allowance" as const,
    };
    const edited = withHourEdit(withHourEdit(row, "hours_low", "7"), "hours_high", "8");
    expect(edited.hours_source).toBe("owner");
    const patched = await api("PATCH", `/api/v1/estimates/${res.data.id}`, {
      line_items: [rowToLineItemPayload(edited, 0)],
      tax_rate: 0,
    });
    expect(patched.status).toBe(200);
    const after = await lineHours(res.data.id);
    expect(after[0]).toMatchObject({ hours_low: "7.00", hours_high: "8.00", hours_source: "owner" });
    expect(after[0].total_cents).toBe(before.total_cents);
  });

  it("7. a booking prefill uses the same form payload as an itemized line", async () => {
    const payload = rowToLineItemPayload({
      description: "Assessment follow-up",
      quantity: "1",
      unit_price: "90.00",
      line_item_type: "labor",
      hours_low: "1.5",
      hours_high: "2",
      hours_source: "owner",
    }, 0);
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [payload],
    });
    expect(res.status).toBe(201);
    expect((await lineHours(res.data.id))[0]).toMatchObject({
      hours_low: "1.50",
      hours_high: "2.00",
      hours_source: "owner",
    });
  });

  it("8. the quick wizard stores the range and the direct-cost confirmation", async () => {
    const hours = formHourColumns({ hours_low: "4", hours_high: "5", hours_source: "owner" });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      flat_rate_cents: 25000,
      presentation_mode: "standard",
      pricing_mode: "flat_rate",
      line_items: [],
      labor_hours_low: hours.hours_low,
      labor_hours_high: hours.hours_high,
      labor_hours_source: hours.hours_source,
      direct_costs_confirmed: true,
    });
    expect(res.status).toBe(201);
    const estimate = await estimateHours(res.data.id);
    expect(estimate.labor_hours_low).toBe("4.00");
    expect(estimate.labor_hours_high).toBe("5.00");
    expect(estimate.labor_hours_source).toBe("owner");
    expect(estimate.direct_costs_confirmed_at).not.toBeNull();
    expect(estimate.total_cents).toBe(25000);
  });

  it("9. Fix now stores the hours typed above the button", async () => {
    const hours = formHourColumns({ hours_low: "1", hours_high: "2", hours_source: "owner" });
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      notes: "Follow-up from visit",
      line_items: [{
        description: "Touch up the hallway",
        quantity: 1,
        unit_price_cents: 0,
        line_item_type: "labor",
        ...hours,
      }],
    });
    expect(res.status).toBe(201);
    expect((await lineHours(res.data.id))[0]).toMatchObject({
      hours_low: "1.00",
      hours_high: "2.00",
      hours_source: "owner",
      total_cents: 0,
    });
  });

  it("10. a direct create stores the hours on the labor line", async () => {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      line_items: [{
        description: "Direct labor",
        quantity: 1,
        unit_price_cents: 5000,
        line_item_type: "labor",
        hours_low: 3,
        hours_high: 4,
        hours_source: "owner",
      }],
    });
    expect(res.status).toBe(201);
    expect((await lineHours(res.data.id))[0]).toMatchObject({
      hours_low: "3.00",
      hours_high: "4.00",
      hours_source: "owner",
      total_cents: 5000,
    });
  });

  it("11. an option quote stores hours on its lines and leaves the baseline empty", async () => {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      tax_rate: 0,
      presentation_mode: "multi_option",
      options: [
        {
          label: "Good",
          sort_order: 0,
          line_items: [{
            description: "Good labor",
            quantity: 1,
            unit_price_cents: 10000,
            hours_low: 2,
            hours_high: 3,
            hours_source: "owner",
          }],
        },
        {
          label: "Better",
          sort_order: 1,
          line_items: [{
            description: "Better labor",
            quantity: 1,
            unit_price_cents: 15000,
            hours_low: 4,
            hours_high: 6,
            hours_source: "owner",
          }],
        },
      ],
    });
    expect(res.status).toBe(201);
    const lines = await lineHours(res.data.id);
    expect(lines.map((line) => [line.hours_low, line.hours_high, line.hours_source, line.option_id != null])).toEqual([
      ["2.00", "3.00", "owner", true],
      ["4.00", "6.00", "owner", true],
    ]);
    const estimate = await estimateHours(res.data.id);
    expect(estimate.labor_hours_low).toBeNull();
    expect(estimate.labor_hours_high).toBeNull();
    expect(estimate.labor_hours_source).toBeNull();
    expect(estimate.baseline_snapshot).toBeNull();
  });
});
