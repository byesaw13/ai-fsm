import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "user-1",
  accountId: "account-1",
  role: "owner" as "owner" | "admin" | "tech",
  traceId: "trace-1",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (request: NextRequest) => handler(request, mockSession),
}));

const mockClientQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  withDbSession: (_session: unknown, fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: mockClientQuery }),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { PUT } from "../route";

function makePut(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/materials/supplier-preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.role = "owner";
});

describe("PUT /api/v1/materials/supplier-preferences", () => {
  it("upserts one preferred branch per normalized supplier and account", async () => {
    mockSession.role = "admin";
    mockClientQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        supplier: "Home Depot",
        supplier_normalized: "home depot",
        branch_label: "Somerville",
        address: "75 Mystic Ave",
      }],
    });
    const response = await PUT(makePut({
      supplier: " Home Depot ",
      branch_label: "Somerville",
      address: "75 Mystic Ave",
    }));
    expect(response.status).toBe(200);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (account_id, supplier_normalized)"),
      [mockSession.accountId, "Home Depot", "home depot", "Somerville", "75 Mystic Ave"],
    );
  });

  it("rejects technician preference writes before touching the database", async () => {
    mockSession.role = "tech";
    const response = await PUT(makePut({
      supplier: "Home Depot",
      branch_label: "Somerville",
    }));
    expect(response.status).toBe(403);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });
});
