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

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

vi.mock("@/lib/db/audit", () => ({
  appendAuditLog: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST as startDay } from "../start/route";
import { PATCH as closeSession } from "../[id]/route";

function request(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe("POST /api/v1/sessions/start", () => {
  it("rejects missing start odometer", async () => {
    const res = await startDay(request("POST", "http://localhost/api/v1/sessions/start", {}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates an open session for a vehicle-less start (BEGIN, set_config, INSERT, COMMIT)", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", session_date: "2026-06-10", vehicle_id: null, start_odometer: 1200 }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await startDay(request("POST", "http://localhost/api/v1/sessions/start", { start_odometer: 1200, session_date: "2026-06-10" }));
    expect(res.status).toBe(201);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("end_odometer, miles"),
      expect.arrayContaining([mockSession.accountId, null, "2026-06-10", 1200])
    );
  });
});

describe("PATCH /api/v1/sessions/[id]", () => {
  it("rejects an end odometer that is not greater than start", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", start_odometer: 1200, end_odometer: null, miles: null, notes: null }] });

    const res = await closeSession(request("PATCH", "http://localhost/api/v1/sessions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", { end_odometer: 1200 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("greater than start");
  });

  it("closes a session and computes miles", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", start_odometer: 1200, end_odometer: null, miles: null, notes: null }] })
      .mockResolvedValueOnce({ rows: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", start_odometer: 1200, end_odometer: 1234, miles: "34", notes: null }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await closeSession(request("PATCH", "http://localhost/api/v1/sessions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", { end_odometer: 1234 }));
    expect(res.status).toBe(200);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("miles = $1 - start_odometer"),
      [1234, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", mockSession.accountId, null]
    );
  });
});
