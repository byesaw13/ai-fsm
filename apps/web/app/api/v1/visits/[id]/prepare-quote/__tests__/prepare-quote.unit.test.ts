/**
 * Unit tests for POST /api/v1/visits/[id]/prepare-quote (TASK-179).
 * DB client, assessment loader, model call and createEstimate are mocked;
 * the preparation functions and create schema are real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { buildAssessmentSummary } from "@ai-fsm/domain";

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

const mockLoadSummary = vi.fn();
vi.mock("@/lib/estimates/assessment-summary-loader", () => ({
  loadAssessmentSummary: (...args: unknown[]) => mockLoadSummary(...args),
}));

vi.mock("@/lib/pricing/settings", () => ({
  loadPricingSettings: vi.fn().mockResolvedValue({ labor_rate_cents_nh: 8500, labor_rate_cents_ma: 9500 }),
}));

const mockExtract = vi.fn();
vi.mock("@/lib/estimates/prepare-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/estimates/prepare-quote")>()),
  extractPreparedScope: (...args: unknown[]) => mockExtract(...args),
}));

const mockCreate = vi.fn();
vi.mock("@/lib/estimates/create-estimate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/estimates/create-estimate")>()),
  createEstimate: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock("@/lib/estimates/tm-briefing", () => ({
  resolveLaborRateCents: () => ({ labor_rate_cents: 8500, travel_rate_cents: 8500, is_ma: false }),
}));

import { POST } from "../route";

const VISIT = "00000000-0000-0000-0000-0000000000aa";
const post = () =>
  new NextRequest(`http://localhost:3000/api/v1/visits/${VISIT}/prepare-quote`, { method: "POST", body: "{}" });

const SUMMARY = buildAssessmentSummary({
  visitId: VISIT,
  assessmentId: "a1",
  rooms: [{ id: "r4", name: "Bathroom", length_ft: 12, width_ft: 8, height_ft: null, notes: "paint ceiling", door_count: 1, window_count: 1 }],
});

const CONTEXT_ROW = {
  job_id: "00000000-0000-0000-0000-0000000000bb",
  client_id: "00000000-0000-0000-0000-0000000000cc",
  property_id: null,
  property_state: "NH",
  assessment_updated_at: "2026-10-23 12:00:00+00",
};

const OUTPUT = {
  groups: [{ key: "bath", label: "Bathroom" }],
  tasks: [
    {
      room_id: "r4", description: "Paint ceiling", kind: "requested", group_key: "bath", quantity_key: "ceiling_sqft",
      count: null, count_unit: null, hours_low: 2, hours_high: 3, materials_cents: 4000, customer_supplied: false, is_alternative: false, price_book_code: null,
      work_type: "other", paint_grade: null,
    },
  ],
  questions: [],
  alternatives: [],
  exclusions: ["Concealed damage"],
};

function queueNoDraftThenContext() {
  mockQuery
    .mockResolvedValueOnce({ rows: [] }) // open draft lookup
    .mockResolvedValueOnce({ rows: [CONTEXT_ROW] }) // visit/job/property
    .mockResolvedValueOnce({ rows: [] }) // price book
    .mockResolvedValueOnce({ rows: [] }); // wall paint pace
}

beforeEach(() => {
  mockQuery.mockReset();
  mockLoadSummary.mockReset().mockResolvedValue(SUMMARY);
  mockExtract.mockReset().mockResolvedValue(OUTPUT);
  mockCreate.mockReset().mockResolvedValue({ id: "E-NEW" });
});

describe("POST /visits/[id]/prepare-quote", () => {
  it("opens the visit's existing draft instead of creating another", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "E-OLD" }] });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "E-OLD", resumed: true });
    expect(mockLoadSummary).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("404 NO_ASSESSMENT when nothing has been saved", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockLoadSummary.mockResolvedValueOnce(null);
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NO_ASSESSMENT");
  });

  it("creates a T&M draft carrying the prepared scope, source visit and line groups", async () => {
    queueNoDraftThenContext();
    const res = await POST(post());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "E-NEW", resumed: false, ai: "ok" });

    const [, input, extra] = mockCreate.mock.calls[0];
    expect(input).toMatchObject({ client_id: CONTEXT_ROW.client_id, job_id: CONTEXT_ROW.job_id, pricing_mode: "hourly_internal" });
    expect(input.line_items.map((l: { quantity: number; unit_price_cents: number }) => [l.quantity, l.unit_price_cents])).toEqual([
      [2.5, 8500],
      [1, 4000],
    ]);
    expect(input.scope_assumptions).toBe("Not included: Concealed damage");
    expect(extra.sourceVisitId).toBe(VISIT);
    expect(extra.lineGroupKeys).toEqual(["bath", "bath"]);
    expect(extra.preparedScope.tasks[0].quantity).toMatchObject({ value: 96, basis: "measured" });
    expect(extra.preparedScope.source.assessment_updated_at).toBe("2026-10-23 12:00:00+00");
  });

  it("still creates a draft with rooms and a notice when the model fails", async () => {
    queueNoDraftThenContext();
    mockExtract.mockRejectedValueOnce(new Error("overloaded"));
    const res = await POST(post());
    expect(res.status).toBe(201);
    expect((await res.json()).ai).toBe("unavailable");
    const [, input, extra] = mockCreate.mock.calls[0];
    expect(input.line_items).toEqual([]);
    expect(extra.preparedScope.groups).toEqual([{ key: "room_bathroom", label: "Bathroom" }]);
    expect(extra.preparedScope.questions[0].text).toMatch(/AI preparation was unavailable/);
  });

  it("treats no API key the same as a failure", async () => {
    queueNoDraftThenContext();
    mockExtract.mockResolvedValueOnce(null);
    const res = await POST(post());
    expect((await res.json()).ai).toBe("unavailable");
  });

  it("returns the draft another request created first", async () => {
    queueNoDraftThenContext();
    mockCreate.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "E-RACED" }] });
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "E-RACED", resumed: true });
  });

  it("404 when the visit is not in this account", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const res = await POST(post());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
