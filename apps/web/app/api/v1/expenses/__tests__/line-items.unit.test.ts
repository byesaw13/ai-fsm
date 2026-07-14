import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockWithExpenseContext = vi.fn();
vi.mock("@/lib/expenses/db", () => ({
  withExpenseContext: (...args: unknown[]) => mockWithExpenseContext(...args),
}));

vi.mock("@ai-fsm/log/web", () => ({
  logger: { error: vi.fn() },
}));

import { PUT } from "../[id]/line-items/route";

function requestWithBody(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/expenses/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/line-items",
    { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
  );
}

describe("PUT /api/v1/expenses/[id]/line-items", () => {
  it("rejects an empty line item name before touching the database", async () => {
    const res = await PUT(requestWithBody({ line_items: [{ name: "", unit_cost_cents: 100 }] }));
    expect(res.status).toBe(400);
    expect(mockWithExpenseContext).not.toHaveBeenCalled();
  });

  it("rejects a negative unit cost before touching the database", async () => {
    const res = await PUT(requestWithBody({ line_items: [{ name: "2x4", unit_cost_cents: -100 }] }));
    expect(res.status).toBe(400);
    expect(mockWithExpenseContext).not.toHaveBeenCalled();
  });

  it("returns 409 when the expense is already billed on an invoice", async () => {
    mockWithExpenseContext.mockImplementation(async (_session, fn) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: "exp-1" }], rowCount: 1 }) // expense exists
          .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 }), // billed check
      };
      return fn(client);
    });

    const res = await PUT(requestWithBody({ line_items: [{ name: "2x4", unit_cost_cents: 400 }] }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("ALREADY_BILLED");
  });
});
