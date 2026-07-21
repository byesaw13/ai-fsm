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

const EST = "00000000-0000-0000-0000-0000000000ee";
function post(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/estimates/${EST}/decompose/apply`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
const BODY = { work_orders: [{ title: "Master bath", scope: "faucet", tasks: [{ label: "Replace faucet", required: true }] }] };

beforeEach(() => vi.clearAllMocks());

describe("POST decompose/apply", () => {
  it("replaces untouched estimate work orders and creates decomposed ones", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM estimates WHERE id/.test(sql)) return Promise.resolve({ rows: [{ status: "approved", client_id: "c1", job_id: "j1", property_id: null }], rowCount: 1 });
      if (/INSERT INTO work_orders/.test(sql)) return Promise.resolve({ rows: [{ id: "wo-new" }], rowCount: 1 });
      if (/COUNT\(\*\)::text AS n FROM work_order_tasks/.test(sql)) return Promise.resolve({ rows: [{ n: "0" }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const res = await POST(post(BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.count).toBe(1);
    const calls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /DELETE FROM work_orders/.test(s))).toBe(true); // replace default
    expect(calls.some((s) => /INSERT INTO work_orders/.test(s))).toBe(true);
    expect(calls.some((s) => /INSERT INTO work_order_tasks/.test(s))).toBe(true); // first-class tasks
    expect(calls).toContain("COMMIT");
  });

  it("rejects a non-approved estimate (409) and creates nothing", async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (/FROM estimates WHERE id/.test(sql)) return Promise.resolve({ rows: [{ status: "draft", client_id: "c1", job_id: "j1", property_id: null }], rowCount: 1 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    const res = await POST(post(BODY));
    expect(res.status).toBe(409);
    const calls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(calls.some((s) => /INSERT INTO work_orders/.test(s))).toBe(false);
    expect(calls.some((s) => s === "ROLLBACK")).toBe(true);
  });
});
