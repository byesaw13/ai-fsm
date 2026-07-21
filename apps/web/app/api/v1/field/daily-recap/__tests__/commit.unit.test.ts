import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "t",
};
vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (h: Function) => (req: NextRequest) => h(req, mockSession),
}));

const mockQuery = vi.fn();
const mockRelease = vi.fn();
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: () => Promise.resolve({ query: mockQuery, release: mockRelease }) }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { POST } from "../commit/route";

const JOB = "00000000-0000-0000-0000-0000000000aa";
const TASK = "00000000-0000-0000-0000-0000000000bb";
const WO = "00000000-0000-0000-0000-0000000000cc";

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/field/daily-recap/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockImplementation((sql: string) => {
    if (/FROM work_order_tasks t JOIN work_orders/.test(sql)) {
      return Promise.resolve({ rows: [{ id: TASK, work_order_id: WO }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
});

describe("POST /api/v1/field/daily-recap/commit", () => {
  it("records per-task time and marks a done task completed", async () => {
    const res = await POST(
      post({
        job_id: JOB,
        date: "2026-07-20",
        task_entries: [{ task_id: TASK, label: "Replace faucet", minutes: 120, status: "done", note: "" }],
        other_entries: [{ activity_type: "material_run", minutes: 30, note: "paint run" }],
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.recorded_minutes).toBe(150);

    const calls = mockQuery.mock.calls.map((c) => String(c[0]));
    // Task time inserted with a task_id column, and the material run too.
    expect(calls.filter((s) => s.includes("INSERT INTO activity_entries")).length).toBe(2);
    const insert = mockQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO activity_entries"))!;
    expect(String(insert[0])).toContain("task_id");
    expect(insert[1]).toContain(TASK); // task_id bound
    // Done task toggled complete.
    expect(calls.some((s) => /UPDATE work_order_tasks SET completed = true/.test(s))).toBe(true);
    // Transaction committed.
    expect(calls).toContain("COMMIT");
  });

  it("rejects a task that does not belong to the job", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM work_order_tasks t JOIN work_orders/.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const res = await POST(
      post({
        job_id: JOB,
        date: "2026-07-20",
        task_entries: [{ task_id: TASK, label: "x", minutes: 60, status: "done", note: "" }],
        other_entries: [],
      }),
    );
    expect(res.status).toBe(400);
    expect(mockQuery.mock.calls.some((c) => String(c[0]) === "ROLLBACK")).toBe(true);
  });
});
