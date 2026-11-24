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
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockClientQuery = vi.fn();
const mockPool = { connect: vi.fn() };
vi.mock("@/lib/db", () => ({ query: vi.fn(), getPool: () => mockPool }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

const recordObservations = vi.fn(async () => ({ inserted: 1, duplicates: 0 }));
vi.mock("@/lib/materials/ledger", () => ({ recordObservations: (...a: unknown[]) => recordObservations(...(a as [])) }));

import { POST } from "../route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/materials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const row = { id: "m1", store_family: "home_depot", unit_cost_cents: 1299, avg_paid_cents: null, purchase_count: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: vi.fn() });
  mockClientQuery.mockImplementation(async (sql: string) => {
    if (/INSERT INTO materials_price_book/.test(sql) || /SELECT \* FROM materials_price_book/.test(sql)) {
      return { rows: [row] };
    }
    return { rows: [] };
  });
});

const item = { name: "Wall paint", category: "paint", unit: "gal", unit_cost_cents: 1299 };

describe("POST /api/v1/materials (TASK-210: prices go through the ledger)", () => {
  it("an AI-guessed price is kept as an AI allowance, never a price or a purchase", async () => {
    const res = await POST(makeRequest({ items: [{ ...item, is_ai_estimate: true }] }));
    expect(res.status).toBe(201);
    const [, , rows] = recordObservations.mock.calls[0] as unknown as [unknown, string, { kind: string }[]];
    expect(rows[0].kind).toBe("ai_allowance");
  });

  it("a typed price is a manual check with its source", async () => {
    await POST(makeRequest({ ...item, source: "Home Depot shelf" }));
    const [, , rows] = recordObservations.mock.calls[0] as unknown as [unknown, string, { kind: string; note: string }[]];
    expect(rows[0].kind).toBe("manual_check");
    expect(rows[0].note).toBe("Home Depot shelf");
  });

  it("the insert never folds a price into the average or the purchase count", async () => {
    await POST(makeRequest(item));
    const insert = mockClientQuery.mock.calls.find(([sql]) => /INSERT INTO materials_price_book/.test(sql))![0] as string;
    expect(insert).not.toMatch(/avg_paid_cents\s*=|purchase_count\s*=|unit_cost_cents\s*=/);
  });

  it("rejects an invalid body before touching the database", async () => {
    const res = await POST(makeRequest({ name: "" }));
    expect(res.status).toBe(422);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});
