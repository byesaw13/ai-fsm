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

vi.mock("@/lib/pricing/settings", () => ({ loadPricingSettings: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/estimates/tm-briefing", () => ({
  resolveLaborRateCents: () => ({ labor_rate_cents: 8500, travel_rate_cents: 8500, is_ma: false }),
}));

import { PUT } from "../route";

const EST = "00000000-0000-0000-0000-0000000000ee";
const put = (body: unknown) =>
  new NextRequest(`http://localhost:3000/api/v1/estimates/${EST}/prepared-scope`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

function estimateRow(status = "draft") {
  return { rows: [{ status, subtotal_cents: 100_000, tax_cents: 6_250, prepared_scope: SCOPE, property_state: "NH" }] };
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
      { ...HAND_LINE, sort_order: 2 },
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
});
