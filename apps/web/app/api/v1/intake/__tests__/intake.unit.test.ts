import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const OWNER_SESSION = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
};

type MockSession = {
  userId: string;
  accountId: string;
  role: "owner" | "admin" | "tech";
  traceId: string;
};

let mockSession: MockSession | null = {
  ...OWNER_SESSION,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (roles: string[], handler: Function) => async (request: NextRequest) => {
    if (!mockSession) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required", traceId: "trace-test" } },
        { status: 401 }
      );
    }
    if (!roles.includes(mockSession.role)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Forbidden", traceId: mockSession.traceId } },
        { status: 403 }
      );
    }
    return handler(request, mockSession);
  },
}));

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const BOOKING_ID = "11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "22222222-2222-2222-2222-222222222222";
const PROPERTY_ID = "33333333-3333-3333-3333-333333333333";
const JOB_ID = "44444444-4444-4444-4444-444444444444";

const VALID_BODY = {
  name: "Jane Client",
  phone: "(555) 123-4567",
  email: "jane@example.com",
  service_category: "general_repairs",
  service_description: "Door latch is loose and needs adjustment.",
  preferred_date: "2099-05-12",
  preferred_time_slot: "flexible",
  address: "123 Main St",
  city: "Springfield",
  sms_consent: false,
  preferred_contact: "email",
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mockSession = {
    ...OWNER_SESSION,
    traceId: "00000000-0000-0000-0000-000000000099",
  };
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
});

describe("POST /api/v1/intake", () => {
  it("creates linked client, property, job, and booking request records", async () => {
    const { POST } = await import("../route");

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // SELECT client by email
      .mockResolvedValueOnce({ rows: [] }) // SELECT client by phone
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID }] }) // INSERT client
      .mockResolvedValueOnce({ rows: [] }) // SELECT property
      .mockResolvedValueOnce({ rows: [{ id: PROPERTY_ID }] }) // INSERT property
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] }) // INSERT job
      .mockResolvedValueOnce({ rows: [{ id: BOOKING_ID }] }) // INSERT booking_request
      .mockResolvedValueOnce({ rows: [] }) // SELECT duplicate candidates
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: BOOKING_ID,
      clientId: CLIENT_ID,
      propertyId: PROPERTY_ID,
      jobId: JOB_ID,
    });

    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sql).toContain("INSERT INTO booking_requests");
    expect(sql).toContain("INSERT INTO clients");
    expect(sql).toContain("INSERT INTO properties");
    expect(sql).toContain("INSERT INTO jobs");

    const insertCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO booking_requests")
    );
    expect(insertCall?.[1]?.[0]).toBe(OWNER_SESSION.accountId);
    expect(insertCall?.[1]?.[1]).toBe(CLIENT_ID);
    expect(insertCall?.[1]?.[2]).toBe(PROPERTY_ID);
    expect(insertCall?.[1]?.[3]).toBe(JOB_ID);
    expect(insertCall?.[1]?.[16]).toBe("email");
    expect(insertCall?.[1]?.[17]).toBe(false);
    expect(insertCall?.[1]?.[18]).toBe("staff_intake");

    const jobInsert = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO jobs")
    );
    expect(jobInsert?.[1]).toEqual([
      OWNER_SESSION.accountId,
      CLIENT_ID,
      PROPERTY_ID,
      "General Repairs - Jane Client",
      "Door latch is loose and needs adjustment.",
      "repair",
      OWNER_SESSION.userId,
    ]);

    const duplicateSelect = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("status NOT IN ('cancelled','converted')")
    );
    expect(duplicateSelect?.[1]).toEqual([
      OWNER_SESSION.accountId,
      BOOKING_ID,
      "jane@example.com",
      "(555) 123-4567",
      "Jane Client",
    ]);
  });

  it("returns 400 for missing required fields", async () => {
    const { POST } = await import("../route");

    const res = await POST(makeRequest({ name: "Jane Client" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockSession = null;
    const { POST } = await import("../route");

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("returns 403 for tech role", async () => {
    mockSession = {
      ...OWNER_SESSION,
      role: "tech" as const,
      traceId: "00000000-0000-0000-0000-000000000099",
    };
    const { POST } = await import("../route");

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(mockClientQuery).not.toHaveBeenCalled();
  });
});
