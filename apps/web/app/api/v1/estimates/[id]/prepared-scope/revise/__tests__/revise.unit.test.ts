/**
 * Unit tests for POST /api/v1/estimates/[id]/prepared-scope/revise (TASK-186).
 * DB client, assessment loader and model call are mocked; the revision logic is real.
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

const mockLoadSummary = vi.fn();
vi.mock("@/lib/estimates/assessment-summary-loader", () => ({
  loadAssessmentSummary: (...args: unknown[]) => mockLoadSummary(...args),
}));

const mockExtract = vi.fn();
vi.mock("@/lib/estimates/revise-quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/estimates/revise-quote")>()),
  extractRevision: (...args: unknown[]) => mockExtract(...args),
}));

import { POST } from "../route";

const ID = "00000000-0000-0000-0000-0000000000ee";
const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: "a1", assessment_updated_at: null },
  groups: [{ key: "pantry", label: "Pantry" }],
  tasks: [
    {
      id: "t5", room_id: null, description: "Paint pantry cabinets", kind: "requested", confirmed: true, group_key: "pantry",
      quantity_key: null, count: null, quantity: null, hours_low: 2.5, hours_high: 4.5, hours_source: "ai_allowance", materials_cents: null,
    },
  ],
  questions: [{ id: "q1", task_ids: ["t5"], text: "Paint the cabinets?", answer: null }],
  alternatives: [],
  exclusions: [],
};
const OUTPUT = {
  summary: "Took the cabinets out.",
  changes: [{ action: "exclude", task_id: "t5", update: null, task: null, ref: null, reason: "You said no." }],
  alternatives_add: [],
};

const post = (body: unknown) =>
  new NextRequest(`http://localhost:3000/api/v1/estimates/${ID}/prepared-scope/revise`, { method: "POST", body: JSON.stringify(body) });

function queueDraft(stored: PreparedScope = SCOPE) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM estimates")) return { rows: [{ status: "draft", prepared_scope: stored }] };
    return { rows: [] };
  });
}
const savedScope = () =>
  JSON.parse(mockQuery.mock.calls.filter((c) => String(c[0]).startsWith("UPDATE estimates")).at(-1)![1][0]) as PreparedScope;

beforeEach(() => {
  mockQuery.mockReset();
  mockLoadSummary.mockReset().mockResolvedValue(buildAssessmentSummary({ visitId: "v1", assessmentId: "a1", rooms: [] }));
  mockExtract.mockReset().mockResolvedValue(OUTPUT);
});

describe("POST /estimates/[id]/prepared-scope/revise", () => {
  it("saves the answers, then returns the proposal without saving it", async () => {
    queueDraft();
    const answered = { ...SCOPE, questions: [{ ...SCOPE.questions[0], answer: "No" }] };
    const res = await POST(post({ prepared_scope: answered, instruction: "" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBe("Took the cabinets out.");
    expect(data.changes).toEqual([expect.objectContaining({ task_id: "t5", action: "exclude" })]);
    expect(data.proposed_scope.tasks[0].confirmed).toBe(false);
    // What was saved is the answer, not the proposal.
    expect(savedScope().questions[0].answer).toBe("No");
    expect(savedScope().tasks[0].confirmed).toBe(true);
  });

  it("keeps a proposal: re-applies it to the saved scope and logs the note", async () => {
    queueDraft();
    const res = await POST(post({ prepared_scope: SCOPE, instruction: "No cabinets", accept: { output: OUTPUT } }));
    expect(res.status).toBe(200);
    expect(mockExtract).not.toHaveBeenCalled();
    expect(savedScope().tasks[0].confirmed).toBe(false);
    expect(savedScope().revisions).toEqual([expect.objectContaining({ instruction: "No cabinets", summary: "Took the cabinets out." })]);
  });

  it("needs an answer or a note", async () => {
    queueDraft();
    const res = await POST(post({ prepared_scope: SCOPE, instruction: "  " }));
    expect(res.status).toBe(400);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("503 when the model is unavailable, with the edits already saved", async () => {
    queueDraft();
    mockExtract.mockResolvedValueOnce(null);
    const res = await POST(post({ prepared_scope: SCOPE, instruction: "Fewer hours" }));
    expect(res.status).toBe(503);
    expect(mockQuery.mock.calls.some((c) => String(c[0]).startsWith("UPDATE estimates"))).toBe(true);
  });

  it("refuses a sent quote and an invalid revision", async () => {
    mockQuery.mockResolvedValue({ rows: [{ status: "sent", prepared_scope: SCOPE }] });
    expect((await POST(post({ prepared_scope: SCOPE, instruction: "x" }))).status).toBe(422);
    queueDraft();
    expect((await POST(post({ prepared_scope: SCOPE, accept: { output: { changes: "bad" } } }))).status).toBe(400);
  });
});
