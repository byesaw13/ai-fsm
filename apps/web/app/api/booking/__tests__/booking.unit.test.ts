import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = {
  connect: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ACCOUNT_ID = "00000000-0000-0000-0000-000000000002";
const BOOKING_ID = "44444444-4444-4444-4444-444444444444";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/booking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  process.env.BOOKING_ACCOUNT_ID = ACCOUNT_ID;
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
});

afterEach(() => {
  delete process.env.BOOKING_ACCOUNT_ID;
});

describe("POST /api/booking", () => {
  it("captures only an intake request without creating operational records", async () => {
    const { POST } = await import("../route");

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: BOOKING_ID }] }) // insert booking request
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(
      makeRequest({
        name: "Jane Client",
        email: "jane@example.com",
        phone: null,
        service_category: "general_repairs",
        service_description: "Door latch is loose and needs adjustment.",
        preferred_date: "2026-05-12",
        preferred_time_slot: "morning",
        address: "123 Main St",
        city: "Springfield",
        state: "MA",
        zip: "01103",
        access_notes: "Use side entrance.",
      })
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      success: true,
      booking_id: BOOKING_ID,
    });

    const sqlStatements = mockClientQuery.mock.calls
      .map((call) => String(call[0]))
      .join("\n");

    expect(sqlStatements).toContain("INSERT INTO booking_requests");
    expect(sqlStatements).not.toContain("INSERT INTO clients");
    expect(sqlStatements).not.toContain("INSERT INTO properties");
    expect(sqlStatements).not.toContain("INSERT INTO jobs");
    expect(sqlStatements).not.toContain("INSERT INTO visits");

    const bookingInsertCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO booking_requests")
    );
    expect(bookingInsertCall?.[1]?.[0]).toBe(ACCOUNT_ID);
    expect(bookingInsertCall?.[1]?.slice(1, 5)).toEqual([null, null, null, null]);
  });

  it("infers the booking account when exactly one account exists", async () => {
    delete process.env.BOOKING_ACCOUNT_ID;
    const inferredAccountId = "11111111-1111-1111-1111-111111111111";
    const { POST } = await import("../route");

    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: inferredAccountId }] }) // account lookup
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: BOOKING_ID }] }) // insert booking request
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(
      makeRequest({
        name: "Jane Client",
        email: "jane@example.com",
        phone: null,
        service_category: "general_repairs",
        service_description: "Door latch is loose and needs adjustment.",
        preferred_date: "2026-05-12",
        preferred_time_slot: "morning",
        address: "123 Main St",
        city: "Springfield",
        state: "MA",
        zip: "01103",
        access_notes: "Use side entrance.",
      })
    );

    expect(res.status).toBe(201);

    const bookingInsertCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO booking_requests")
    );
    expect(bookingInsertCall?.[1]?.[0]).toBe(inferredAccountId);
  });

  it("returns 503 when no booking account can be inferred", async () => {
    delete process.env.BOOKING_ACCOUNT_ID;
    const { POST } = await import("../route");

    mockClientQuery.mockResolvedValueOnce({ rows: [] }); // account lookup

    const res = await POST(
      makeRequest({
        name: "Jane Client",
        email: "jane@example.com",
        phone: null,
        service_category: "general_repairs",
        service_description: "Door latch is loose and needs adjustment.",
        preferred_date: "2026-05-12",
        preferred_time_slot: "morning",
        address: "123 Main St",
        city: "Springfield",
        state: "MA",
        zip: "01103",
        access_notes: "Use side entrance.",
      })
    );

    expect(res.status).toBe(503);
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(String(mockClientQuery.mock.calls[0][0])).toContain("FROM accounts");
  });

  it("returns 400 for invalid request bodies", async () => {
    const { POST } = await import("../route");

    const res = await POST(
      makeRequest({
        name: "Jane Client",
        service_category: "general_repairs",
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toBe("Invalid request body");
  });
});
