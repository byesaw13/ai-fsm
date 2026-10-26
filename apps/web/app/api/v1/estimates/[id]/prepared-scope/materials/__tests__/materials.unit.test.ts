/**
 * Unit tests for POST /api/v1/estimates/[id]/prepared-scope/materials (TASK-187).
 * DB client, assessment loader and the materials generator are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { buildAssessmentSummary, type PreparedScope } from "@ai-fsm/domain";

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

vi.mock("@/lib/estimates/assessment-summary-loader", () => ({
  loadAssessmentSummary: vi.fn().mockResolvedValue(buildAssessmentSummary({ visitId: "v1", assessmentId: "a1", rooms: [] })),
}));

const mockGenerate = vi.fn();
vi.mock("@/lib/estimates/materials-generator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/estimates/materials-generator")>()),
  generateMaterials: (...args: unknown[]) => mockGenerate(...args),
}));

import { POST } from "../route";

const ID = "00000000-0000-0000-0000-0000000000ee";
const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: "a1", assessment_updated_at: null },
  groups: [{ key: "bath", label: "Bathroom" }],
  tasks: [
    {
      id: "t1", room_id: null, description: "Replace toilet", kind: "requested", confirmed: true, group_key: "bath",
      quantity_key: null, count: null, quantity: null, hours_low: 2, hours_high: 3, hours_source: "ai_allowance", materials_cents: 30000,
    },
  ],
  questions: [],
  alternatives: [],
  exclusions: [],
};
const RESULT = {
  items: [{ name: "Toilet", brand: null, category: "plumbing", base_quantity: 1, waste_factor_pct: 0, quantity: 1, unit: "each", unit_cost_cents: 28900, total_cost_cents: 28900, confidence: "estimated", notes: "", price_book_id: null }],
  summary_notes: "", total_cost_cents: 28900, assumptions: [], missing_measurements: [], excluded_customer_supplied_items: [],
};

let stored: PreparedScope = SCOPE;
const post = (body: unknown) =>
  new NextRequest(`http://localhost:3000/api/v1/estimates/${ID}/prepared-scope/materials`, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  stored = SCOPE;
  mockQuery.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM estimates")) return { rows: [{ status: "draft", prepared_scope: stored }] };
    if (sql.startsWith("UPDATE estimates")) stored = JSON.parse(params![0] as string);
    return { rows: [] };
  });
  mockGenerate.mockReset().mockResolvedValue(RESULT);
});

describe("POST /estimates/[id]/prepared-scope/materials", () => {
  it("lists a work area's materials and saves them on the scope", async () => {
    const res = await POST(post({ prepared_scope: SCOPE, group_keys: ["bath"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.failed).toEqual([]);
    expect(stored.materials?.bath.lines).toEqual([expect.objectContaining({ name: "Toilet", unit_cost_cents: 28900, source: "ai_estimate" })]);
    expect(data.prepared_scope.materials.bath.task_ids).toEqual(["t1"]);
  });

  it("clears a list back to the allowance without calling the generator", async () => {
    stored = { ...SCOPE, materials: { bath: { task_ids: ["t1"], lines: [], customer_supplied: [], assumptions: [] } } };
    const res = await POST(post({ prepared_scope: stored, clear: ["bath"] }));
    expect(res.status).toBe(200);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(stored.materials?.bath).toBeUndefined();
  });

  it("503 with the edits saved when every area fails", async () => {
    mockGenerate.mockRejectedValue(new Error("AI estimating isn't configured yet."));
    const res = await POST(post({ prepared_scope: SCOPE, group_keys: ["bath"] }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/Your edits are saved/);
  });

  it("needs a work area, and refuses a sent quote", async () => {
    expect((await POST(post({ prepared_scope: SCOPE }))).status).toBe(400);
    mockQuery.mockResolvedValue({ rows: [{ status: "sent", prepared_scope: SCOPE }] });
    expect((await POST(post({ prepared_scope: SCOPE, group_keys: ["bath"] }))).status).toBe(422);
  });
});
