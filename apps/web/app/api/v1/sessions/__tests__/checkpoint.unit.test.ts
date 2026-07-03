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

import { POST as checkpoint } from "../[id]/checkpoint/route";

const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function request(body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/sessions/${SESSION_ID}/checkpoint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe("POST /api/v1/sessions/[id]/checkpoint", () => {
  it("rejects checkpoint on closed session", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, start_odometer: 1200, end_odometer: 1250, miles: "50", notes: null }],
      });

    const res = await checkpoint(request({ odometer: 1240 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("SESSION_CLOSED");
  });

  it("rejects odometer below start", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, start_odometer: 1200, end_odometer: null, miles: null, notes: null }],
      });

    const res = await checkpoint(request({ odometer: 1100 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("start reading");
  });

  it("rejects odometer below last checkpoint", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: SESSION_ID,
          start_odometer: 1200,
          end_odometer: null,
          miles: null,
          notes: "Prior note\n[checkpoint 2026-07-03T12:00:00.000Z] 1500 mi",
        }],
      });

    const res = await checkpoint(request({ odometer: 1400 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("last checkpoint");
  });

  it("appends checkpoint to notes on open session", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, start_odometer: 1200, end_odometer: null, miles: null, notes: "Prior note" }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: SESSION_ID, notes: "Prior note\n[checkpoint 2026-07-03T12:00:00.000Z] 1234 mi" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await checkpoint(request({ odometer: 1234 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.last_checkpoint_odometer).toBe(1234);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET notes = $1"),
      expect.arrayContaining([expect.stringContaining("[checkpoint"), SESSION_ID, mockSession.accountId]),
    );
  });
});