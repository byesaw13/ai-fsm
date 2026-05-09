import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as "owner" | "admin" | "tech",
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (roles: string[], handler: Function) => async (request: NextRequest) => {
    if (!roles.includes(mockSession.role)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Forbidden", traceId: mockSession.traceId } },
        { status: 403 }
      );
    }
    return handler(request, mockSession);
  },
}));

const mockQuery = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { PATCH } from "../route";

const VISIT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const BASE = `http://localhost:3000/api/v1/visits/${VISIT_ID}/sub-status`;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSession.role = "owner";
});

describe("PATCH /api/v1/visits/[id]/sub-status", () => {
  it("updates a visit sub-status", async () => {
    mockQuery.mockResolvedValueOnce([{ id: VISIT_ID, sub_status: "weather_hold" }]);

    const res = await PATCH(makeRequest({ sub_status: "weather_hold" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ id: VISIT_ID, sub_status: "weather_hold" });
    expect(mockQuery.mock.calls[0][0]).toContain("UPDATE visits");
    expect(mockQuery.mock.calls[0][1]).toEqual(["weather_hold", VISIT_ID, mockSession.accountId]);
  });

  it("returns 400 for an invalid sub-status", async () => {
    const res = await PATCH(makeRequest({ sub_status: "customer_hold" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns 403 for tech role", async () => {
    mockSession.role = "tech";

    const res = await PATCH(makeRequest({ sub_status: "weather_hold" }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
