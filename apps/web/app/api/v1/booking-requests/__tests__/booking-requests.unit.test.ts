import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId:    "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId:   "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) =>
    handler(req, mockSession),
}));

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("@/lib/db", () => ({ getPool: () => mockPool }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { PATCH } from "../[id]/route";

const REQUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BASE = `http://localhost:3000/api/v1/booking-requests/${REQUEST_ID}`;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(BASE, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
});

// Route query order: 1) BEGIN, 2) set_config, 3) SELECT status,
// 4) UPDATE RETURNING *, 5) optional status_history INSERT, 6) COMMIT/ROLLBACK

describe("PATCH /api/v1/booking-requests/[id]", () => {
  it("marks a pending booking request as reviewed", async () => {
    const updated = { id: REQUEST_ID, status: "reviewed" };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                       // BEGIN
      .mockResolvedValueOnce({ rows: [] })                       // set_config
      .mockResolvedValueOnce({ rows: [{ status: "pending" }] }) // SELECT status
      .mockResolvedValueOnce({ rows: [updated] })                // UPDATE RETURNING
      .mockResolvedValueOnce({ rows: [] })                       // status_history INSERT
      .mockResolvedValueOnce({ rows: [] });                      // COMMIT

    const res = await PATCH(makeRequest({ status: "reviewed" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("reviewed");

    const updateCall = mockClientQuery.mock.calls[3];
    expect(updateCall[0]).toContain("UPDATE booking_requests");
    expect(updateCall[1]).toEqual([
      REQUEST_ID,
      mockSession.accountId,
      "reviewed",
      mockSession.userId,
    ]);

    const statusHistoryCall = mockClientQuery.mock.calls[4];
    expect(statusHistoryCall[0]).toContain("INSERT INTO status_history");
    expect(statusHistoryCall[1]).toEqual([
      mockSession.accountId,
      "booking_request",
      REQUEST_ID,
      "pending",
      "reviewed",
      mockSession.userId,
      null,
    ]);
  });

  it("saves review_notes without changing status", async () => {
    const updated = { id: REQUEST_ID, status: "pending", review_notes: "Called, left message." };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "pending" }] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await PATCH(makeRequest({ review_notes: "Called, left message." }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.review_notes).toBe("Called, left message.");
  });

  it("returns 422 for invalid status values", async () => {
    const res = await PATCH(makeRequest({ status: "done" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects converted status via PATCH — conversion is via /convert endpoint", async () => {
    const res = await PATCH(makeRequest({ status: "converted" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks updates to already-converted booking requests", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: "converted" }] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await PATCH(makeRequest({ status: "cancelled" }));

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 404 when the booking request does not exist", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // SELECT → not found
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await PATCH(makeRequest({ status: "reviewed" }));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
