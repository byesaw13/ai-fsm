import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("../../../../../lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = {
  connect: vi.fn(),
};

vi.mock("../../../../../lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  getPool: () => mockPool,
}));

vi.mock("../../../../../lib/db/audit", () => ({
  appendAuditLog: vi.fn(),
}));

import { GET, POST } from "../route";
import { GET as getEvents } from "../events/route";

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

const BASE = "http://localhost:3000/api/v1/automations";

const SAMPLE_AUTOMATION = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  account_id: mockSession.accountId,
  type: "visit_reminder",
  enabled: true,
  config: { hours_before: 24 },
  next_run_at: new Date().toISOString(),
  last_run_at: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe("GET /api/v1/automations", () => {
  it("returns 200 with automations array", async () => {
    mockQuery
      .mockResolvedValueOnce([SAMPLE_AUTOMATION])
      .mockResolvedValueOnce([{ sent: 5 }])
      .mockResolvedValueOnce([{ sent: 12 }]);

    const res = await GET(makeRequest("GET", BASE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].type).toBe("visit_reminder");
  });

  it("returns 200 with empty array when no automations", async () => {
    mockQuery.mockResolvedValue([]);

    const res = await GET(makeRequest("GET", BASE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});

describe("GET /api/v1/automations/events", () => {
  it("returns 200 with events array", async () => {
    mockQuery.mockResolvedValue([]);

    const res = await getEvents(makeRequest("GET", BASE + "/events"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});

describe("POST /api/v1/automations", () => {
  it("returns 201 with created automation on valid body", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [SAMPLE_AUTOMATION] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await POST(
      makeRequest("POST", BASE, { type: "visit_reminder", config: { hours_before: 24 } })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.type).toBe("visit_reminder");
  });

  it("returns 422 when type is missing", async () => {
    const res = await POST(makeRequest("POST", BASE, { config: {} }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when type is invalid", async () => {
    const res = await POST(
      makeRequest("POST", BASE, { type: "invalid_type", config: {} })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});
