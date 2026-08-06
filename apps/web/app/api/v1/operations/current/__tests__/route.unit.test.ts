import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockState = {
  business_day: null,
  clocked_in: false,
  clock: null,
  activity: null,
  vehicle_session: null,
  valid_transitions: ["open_business_day", "clock_in", "switch_activity", "start_mileage_session"],
};

const mockGetCurrentOperationsState = vi.fn(async () => mockState);
vi.mock("@/lib/operations/state", () => ({
  getCurrentOperationsState: (...args: unknown[]) => mockGetCurrentOperationsState(...args),
}));

const mockWithDbSession = vi.fn(async (_session: unknown, fn: (client: unknown) => Promise<unknown>) =>
  fn({}),
);
vi.mock("@/lib/db", () => ({
  withDbSession: (...args: unknown[]) => mockWithDbSession(...(args as [unknown, (c: unknown) => Promise<unknown>])),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { GET } from "../route";

describe("GET /api/v1/operations/current (TASK-056)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentOperationsState.mockResolvedValue(mockState);
  });

  it("returns 200 with CurrentOperationsState shape including valid_transitions", async () => {
    const res = await GET(new NextRequest("http://localhost/api/v1/operations/current"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      business_day: null,
      clocked_in: false,
      valid_transitions: expect.arrayContaining(["open_business_day", "clock_in", "switch_activity"]),
    });
    expect(mockGetCurrentOperationsState).toHaveBeenCalledWith(
      expect.anything(),
      mockSession.accountId,
      mockSession.userId,
    );
  });

  it("returns 500 when state load throws", async () => {
    mockGetCurrentOperationsState.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(new NextRequest("http://localhost/api/v1/operations/current"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});
