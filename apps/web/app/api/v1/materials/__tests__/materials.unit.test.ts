import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock auth so we can control session injection
// ---------------------------------------------------------------------------
const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

// ---------------------------------------------------------------------------
// Mock the DB layer so no real connections are made
// ---------------------------------------------------------------------------
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  getPool: () => mockPool,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/materials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
});

// Route query order for a single-item POST: 1) BEGIN, 2) set_config,
// 3) INSERT ... ON CONFLICT ... RETURNING *, 4) COMMIT

describe("POST /api/v1/materials", () => {
  it("an AI-guessed price save does not touch avg_paid_cents/purchase_count", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({
        rows: [
          {
            id: "m1",
            name: "2x4",
            unit_cost_cents: 399,
            avg_paid_cents: null,
            purchase_count: 0,
          },
        ],
      }) // INSERT ... RETURNING *
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(
      makeRequest({
        name: "2x4",
        unit: "each",
        unit_cost_cents: 399,
        is_ai_estimate: true,
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data[0].avg_paid_cents).toBeNull();
    expect(json.data[0].purchase_count).toBe(0);

    const insertCall = mockClientQuery.mock.calls[2];
    expect(insertCall[0]).toContain("INSERT INTO materials_price_book");
    // is_ai_estimate flag is the last bound param
    expect(insertCall[1][insertCall[1].length - 1]).toBe(true);
  });

  it("a real receipt-backed purchase save still updates avg_paid_cents/purchase_count (regression guard)", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({
        rows: [
          {
            id: "m2",
            name: "Deck Screws",
            unit_cost_cents: 1200,
            avg_paid_cents: 1200,
            purchase_count: 1,
          },
        ],
      }) // INSERT ... RETURNING * (first purchase)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(
      makeRequest({
        name: "Deck Screws",
        unit: "box",
        unit_cost_cents: 1200,
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data[0].avg_paid_cents).toBe(1200);
    expect(json.data[0].purchase_count).toBe(1);

    const insertCall = mockClientQuery.mock.calls[2];
    // Default (unflagged) request must bind is_ai_estimate = false
    expect(insertCall[1][insertCall[1].length - 1]).toBe(false);
  });

  it("second real purchase of the same item updates the rolling average", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({
        // Simulates the ON CONFLICT DO UPDATE branch averaging 1200 (existing,
        // count 1) with a new 1600 purchase: round((1200*1 + 1600) / 2) = 1400
        rows: [
          {
            id: "m2",
            name: "Deck Screws",
            unit_cost_cents: 1600,
            avg_paid_cents: 1400,
            purchase_count: 2,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(
      makeRequest({
        name: "Deck Screws",
        unit: "box",
        unit_cost_cents: 1600,
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data[0].avg_paid_cents).toBe(1400);
    expect(json.data[0].purchase_count).toBe(2);
  });

  it("rejects an invalid body before touching the database", async () => {
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(422);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});
