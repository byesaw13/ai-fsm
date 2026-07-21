import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = { userId: "u1", accountId: "a1", role: "owner" as const, traceId: "t" };
vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_r: string[], h: Function) => (req: NextRequest) => h(req, mockSession),
}));
const mockQuery = vi.fn();
const mockRelease = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ connect: () => Promise.resolve({ query: mockQuery, release: mockRelease }) }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { POST } from "../apply/route";
import { flattenDecompositionTasks } from "@/lib/estimates/flatten-decomposition";

const EST = "00000000-0000-0000-0000-0000000000ee";
function post(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/estimates/${EST}/decompose/apply`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const BODY = { work_orders: [{ title: "Master bath", scope: "faucet", tasks: [{ label: "Replace faucet", required: true }] }] };

beforeEach(() => vi.clearAllMocks());

describe("POST decompose/apply", () => {
  it("replaces untouched estimate work orders and creates one ready WO with tasks", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM estimates e LEFT JOIN jobs/.test(sql) || /FROM estimates WHERE id/.test(sql)) {
        return Promise.resolve({
          rows: [{ status: "approved", client_id: "c1", job_id: "j1", property_id: null, job_title: "Bath refresh" }],
          rowCount: 1,
        });
      }
      if (/INSERT INTO work_orders/.test(sql)) return Promise.resolve({ rows: [{ id: "wo-new" }], rowCount: 1 });
      if (/COUNT\(\*\)::text AS n FROM work_order_tasks/.test(sql)) return Promise.resolve({ rows: [{ n: "0" }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const res = await POST(post(BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.count).toBe(1);
    expect(json.data.task_count).toBe(1);
    expect(json.data.created_work_order_ids).toEqual(["wo-new"]);
    const calls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /DELETE FROM work_orders/.test(s))).toBe(true); // replace default
    expect(calls.some((s) => /INSERT INTO work_orders/.test(s))).toBe(true);
    // Linked job → ready (not draft)
    const insertCall = mockQuery.mock.calls.find((c) => /INSERT INTO work_orders/.test(String(c[0])));
    expect(insertCall?.[1]).toContain("ready");
    expect(insertCall?.[1]).toContain("Bath refresh"); // job title preferred
    expect(calls.some((s) => /INSERT INTO work_order_tasks/.test(s))).toBe(true);
    expect(calls).toContain("COMMIT");
  });

  it("flattens multi-area proposals into one work order", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM estimates e LEFT JOIN jobs/.test(sql)) {
        return Promise.resolve({
          rows: [{ status: "approved", client_id: "c1", job_id: "j1", property_id: null, job_title: "House job" }],
          rowCount: 1,
        });
      }
      if (/INSERT INTO work_orders/.test(sql)) return Promise.resolve({ rows: [{ id: "wo-1" }], rowCount: 1 });
      if (/COUNT\(\*\)::text AS n FROM work_order_tasks/.test(sql)) return Promise.resolve({ rows: [{ n: "0" }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const multi = {
      work_orders: [
        { title: "Master bath", scope: "plumbing", tasks: [{ label: "Replace faucet", required: true }] },
        { title: "Living room", scope: "paint", tasks: [{ label: "Paint accent wall", required: true }] },
      ],
    };
    const res = await POST(post(multi));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.count).toBe(1);
    expect(json.data.task_count).toBe(2);
    // Only one WO insert
    expect(mockQuery.mock.calls.filter((c) => /INSERT INTO work_orders/.test(String(c[0]))).length).toBe(1);
    const insert = mockQuery.mock.calls.find((c) => /INSERT INTO work_orders/.test(String(c[0])))!;
    const criteria = JSON.parse(String(insert[1].find((v: unknown) => typeof v === "string" && v.startsWith("["))));
    expect(criteria.map((c: { label: string }) => c.label)).toEqual([
      "Master bath — Replace faucet",
      "Living room — Paint accent wall",
    ]);
  });

  it("rejects a non-approved estimate (409) and creates nothing", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM estimates e LEFT JOIN jobs/.test(sql) || /FROM estimates WHERE id/.test(sql)) {
        return Promise.resolve({ rows: [{ status: "draft", client_id: "c1", job_id: "j1", property_id: null, job_title: null }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const res = await POST(post(BODY));
    expect(res.status).toBe(409);
    const calls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /INSERT INTO work_orders/.test(s))).toBe(false);
    expect(calls.some((s) => s === "ROLLBACK")).toBe(true);
  });
});

describe("flattenDecompositionTasks", () => {
  it("keeps a single group as-is", () => {
    const flat = flattenDecompositionTasks([
      { title: "Bath", scope: "fixtures", tasks: [{ label: "Replace faucet", required: true }] },
    ]);
    expect(flat.tasks[0].label).toBe("Replace faucet");
    expect(flat.title).toBe("Bath");
  });
});
