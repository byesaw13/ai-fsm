/**
 * Unit tests for PUT /api/v1/estimates/[id]/prepared-scope (TASK-179).
 * DB client and updateEstimateById are mocked; scope merge and line building are real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { PreparedScope } from "@ai-fsm/domain";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_r: string[], h: Function) => (req: NextRequest) => h(req, mockSession),
}));

const mockQuery = vi.fn();
vi.mock("@/lib/estimates/db", () => ({
  withEstimateContext: (_s: unknown, fn: (c: unknown) => unknown) => fn({ query: mockQuery }),
}));

const mockUpdate = vi.fn();
vi.mock("@/lib/estimates/repository", () => ({
  updateEstimateById: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock("@/lib/pricing/settings", () => ({ loadPricingSettings: vi.fn().mockResolvedValue({ labor_cost_cents_per_hour: 5000 }) }));
vi.mock("@/lib/estimates/tm-briefing", () => ({
  resolveLaborRateCents: () => ({ labor_rate_cents: 8500, travel_rate_cents: 8500, is_ma: false }),
}));

import { PUT } from "../route";
import { STALE_QUOTE_MESSAGE } from "@/lib/estimates/quote-version";

const EST = "00000000-0000-0000-0000-0000000000ee";
const UPDATED_AT = "2026-10-29T12:00:00.000Z";
const put = (body: Record<string, unknown>) =>
  new NextRequest(`http://localhost:3000/api/v1/estimates/${EST}/prepared-scope`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ updated_at: UPDATED_AT, ...body }),
  });

const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: "a1", assessment_updated_at: null },
  groups: [{ key: "bath", label: "Bathroom" }],
  tasks: [
    {
      id: "t1", room_id: "r4", description: "Paint ceiling", kind: "requested", confirmed: true, group_key: "bath",
      quantity_key: "ceiling_sqft", count: null, quantity: { key: "ceiling_sqft", value: 96, unit: "sqft", basis: "measured" },
      hours_low: 2, hours_high: 3, hours_source: "ai_allowance", materials_cents: 4000,
    },
  ],
  questions: [],
  alternatives: [],
  exclusions: [],
};

function estimateRow(status = "draft", notes: string | null = null, scope: PreparedScope = SCOPE) {
  return { rows: [{ status, subtotal_cents: 100_000, tax_cents: 6_250, notes, prepared_scope: scope, property_state: "NH", updated_at: new Date(UPDATED_AT) }] };
}

const HAND_LINE = {
  description: "Haul-away fee", quantity: 1, unit_price_cents: 7500, line_item_type: "labor",
  visible_to_customer: true, adjustment_type: null, sort_order: 5, price_book_id: null,
};

beforeEach(() => {
  mockQuery.mockReset();
  mockUpdate.mockReset().mockResolvedValue({ updated: true });
});

describe("PUT /estimates/[id]/prepared-scope", () => {
  it("saves edits without touching line items when not applying", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow()).mockResolvedValueOnce({ rows: [] });
    const edited = structuredClone(SCOPE);
    edited.tasks[0].hours_high = 4;
    const res = await PUT(put({ prepared_scope: edited }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(false);
    expect(body.prepared_scope.tasks[0]).toMatchObject({ hours_high: 4, hours_source: "owner" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("apply rebuilds the prepared lines first and keeps the owner's lines after them", async () => {
    mockQuery
      .mockResolvedValueOnce(estimateRow())
      .mockResolvedValueOnce({ rows: [] }) // UPDATE prepared_scope
      .mockResolvedValueOnce({ rows: [HAND_LINE] }); // owner lines
    const res = await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).applied).toBe(true);

    const [, id, , patch] = mockUpdate.mock.calls[0];
    expect(id).toBe(EST);
    expect(patch.tax_rate).toBe(6.25);
    expect(patch.line_items).toEqual([
      expect.objectContaining({ quantity: 2.5, unit_price_cents: 8500, line_item_type: "labor", prepared_group_key: "bath", sort_order: 0 }),
      expect.objectContaining({ quantity: 1, unit_price_cents: 4000, line_item_type: "materials", prepared_group_key: "bath", sort_order: 1 }),
      { ...HAND_LINE, sort_order: 2, hours_low: null, hours_high: null, hours_source: null },
    ]);
  });

  it("only reads owner lines that have no prepared group", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow()).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(mockQuery.mock.calls[2][0]).toContain("prepared_group_key IS NULL");
  });

  it("refuses a quote that is no longer a draft", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow("sent"));
    const res = await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(res.status).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("400 for an invalid scope, 404 for an unknown estimate", async () => {
    expect((await PUT(put({ prepared_scope: { version: 2 } }))).status).toBe(400);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect((await PUT(put({ prepared_scope: SCOPE }))).status).toBe(404);
  });

  it("rejects a stale updated_at and does not write", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow());
    const res = await PUT(put({ prepared_scope: SCOPE, updated_at: "2026-10-29T11:00:00.000Z" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toBe(STALE_QUOTE_MESSAGE);
    expect(mockQuery.mock.calls.some((call) => String(call[0]).startsWith("UPDATE"))).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("PUT /estimates/[id]/prepared-scope pricing (TASK-180)", () => {
  function finalUpdate() {
    const call = mockQuery.mock.calls.find((c) => String(c[0]).includes("SET pricing_mode"));
    return call?.[1] as unknown[];
  }

  it("records T&M lane, internal costs from expected hours, and writes notes when blank", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow()).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const res = await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(res.status).toBe(200);
    const [mode, laborCost, materials, notes] = finalUpdate();
    expect(mode).toBe("hourly_internal");
    expect(laborCost).toBe(12_500); // 2.5 midpoint hours × $50 cost, not price ÷ rate
    expect(materials).toBe(4000);
    expect(notes).toMatch(/^What's included/);
    expect((await res.json()).prepared_scope.proposal_notes).toBe(notes);
  });

  it("itemized materials set the internal materials cost and the buy list (TASK-187)", async () => {
    const itemized: PreparedScope = {
      ...SCOPE,
      materials: {
        bath: {
          task_ids: ["t1"],
          lines: [{ id: "m1", name: "Ceiling paint", quantity: 2, unit: "gallon", unit_cost_cents: 4500, source: "your_price", price_book_id: "pb1", notes: "" }],
          customer_supplied: [],
          assumptions: [],
        },
      },
    };
    mockQuery.mockResolvedValueOnce(estimateRow("draft", null, itemized)).mockResolvedValue({ rows: [] });
    const res = await PUT(put({ prepared_scope: itemized, apply: true }));
    expect(res.status).toBe(200);
    const params = finalUpdate();
    expect(params[2]).toBe(9000);
    expect(JSON.parse(params[6] as string)).toEqual({
      source: "prepared_scope",
      sections: [{ section: "Bathroom", computed_items: [{ material: { name: "Ceiling paint", unit: "gallon" }, quantity: 2 }] }],
    });
  });

  it("leaves the buy list alone when nothing is itemized", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow()).mockResolvedValue({ rows: [] });
    await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(finalUpdate()[6]).toBeNull();
  });

  it("never overwrites notes the owner wrote", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow("draft", "Owner wrote this")).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(finalUpdate()[3]).toBeNull();
  });

  it("replaces notes that are still Apply's own earlier text", async () => {
    const stored = { ...SCOPE, proposal_notes: "What's included\n\nold" };
    mockQuery.mockResolvedValueOnce(estimateRow("draft", "What's included\n\nold", stored)).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await PUT(put({ prepared_scope: SCOPE, apply: true }));
    expect(finalUpdate()[3]).toMatch(/Paint ceiling/);
  });

  it("fixed price: flat-rate lane and lines summing to the price", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow()).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const fixed = { ...SCOPE, pricing: { mode: "fixed" as const, fixed_price_cents: 60_000, expected_hours: null, overhead_cents: 0, reserve_pct: 0 } };
    await PUT(put({ prepared_scope: fixed, apply: true }));
    expect(finalUpdate()[0]).toBe("flat_rate");
    const lines = mockUpdate.mock.calls[0][3].line_items as Array<{ unit_price_cents: number; quantity: number }>;
    expect(lines.reduce((s, l) => s + l.unit_price_cents * l.quantity, 0)).toBe(60_000);
  });

  it("400 INVALID_PRICE when the fixed price is below materials", async () => {
    mockQuery.mockResolvedValueOnce(estimateRow()).mockResolvedValueOnce({ rows: [] });
    const fixed = { ...SCOPE, pricing: { mode: "fixed" as const, fixed_price_cents: 1000, expected_hours: null, overhead_cents: 0, reserve_pct: 0 } };
    const res = await PUT(put({ prepared_scope: fixed, apply: true }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_PRICE");
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
