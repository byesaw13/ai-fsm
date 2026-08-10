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

import { PATCH } from "../route";

function makePatch(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/jobs/job-1/materials/line-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.role = "owner";
});

describe("PATCH /api/v1/jobs/[id]/materials/[lineId]", () => {
  it("updates the job snapshot and opted-in catalog memory in one transaction", async () => {
    mockSession.role = "owner";
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: "line-1",
          catalog_material_id: "catalog-1",
          supplier: "Home Depot",
          aisle: "13",
          bay: "8",
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const response = await PATCH(makePatch({
      supplier: "Home Depot",
      aisle: "13",
      bay: "8",
      remember_for_future: true,
    }));

    expect(response.status).toBe(200);
    expect(mockClientQuery).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE materials_price_book"),
      ["Home Depot", "13", "8", "catalog-1", mockSession.accountId],
    );
  });

  it("keeps assigned technicians status-only", async () => {
    mockSession.role = "tech";
    const response = await PATCH(makePatch({ aisle: "13" }));
    expect(response.status).toBe(403);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("does not update catalog memory without explicit opt-in", async () => {
    mockSession.role = "owner";
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "line-1" }] });
    const response = await PATCH(makePatch({ aisle: "13", bay: null }));
    expect(response.status).toBe(200);
    expect(mockClientQuery).toHaveBeenCalledTimes(2);
  });
});
