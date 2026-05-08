import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) =>
    handler(req, mockSession),
}));

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = {
  connect: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

vi.mock("@/lib/db/audit", () => ({
  appendAuditLog: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

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

const SAMPLE_REQUEST = {
  id: REQUEST_ID,
  account_id: mockSession.accountId,
  status: "pending",
  name: "Jane Client",
  email: "jane@example.com",
  phone: null,
  address: "123 Main St",
  city: "Springfield",
  state: "MA",
  zip: "01103",
  service_category: "general_repairs",
  service_description: "Door latch is loose and needs adjustment.",
  client_id: null,
  property_id: null,
  job_id: null,
  visit_id: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
});

describe("PATCH /api/v1/booking-requests/[id]", () => {
  it("marks a linked pending booking request as reviewed", async () => {
    const linked = {
      ...SAMPLE_REQUEST,
      client_id: "11111111-1111-1111-1111-111111111111",
      property_id: "22222222-2222-2222-2222-222222222222",
      job_id: "33333333-3333-3333-3333-333333333333",
    };
    const updated = { ...linked, status: "reviewed" };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [linked] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await PATCH(makeRequest({ status: "reviewed" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("reviewed");
    expect(mockClientQuery.mock.calls[3][0]).toContain("UPDATE booking_requests");
    expect(mockClientQuery.mock.calls[3][1]).toEqual([
      REQUEST_ID,
      mockSession.accountId,
      "reviewed",
      mockSession.userId,
      linked.client_id,
      linked.property_id,
      linked.job_id,
      null,
    ]);
  });

  it("creates client, property, and draft job when reviewing a raw intake request", async () => {
    const clientId = "11111111-1111-1111-1111-111111111111";
    const propertyId = "22222222-2222-2222-2222-222222222222";
    const jobId = "33333333-3333-3333-3333-333333333333";
    const updated = {
      ...SAMPLE_REQUEST,
      status: "reviewed",
      client_id: clientId,
      property_id: propertyId,
      job_id: jobId,
    };

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [SAMPLE_REQUEST] }) // SELECT booking FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // client lookup by email
      .mockResolvedValueOnce({ rows: [{ id: clientId }] }) // insert client
      .mockResolvedValueOnce({ rows: [] }) // property lookup
      .mockResolvedValueOnce({ rows: [{ id: propertyId }] }) // insert property
      .mockResolvedValueOnce({ rows: [{ id: jobId }] }) // insert draft job
      .mockResolvedValueOnce({ rows: [updated] }) // update booking request
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await PATCH(makeRequest({ status: "reviewed" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.job_id).toBe(jobId);

    const sqlStatements = mockClientQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sqlStatements).toContain("INSERT INTO clients");
    expect(sqlStatements).toContain("INSERT INTO properties");
    expect(sqlStatements).toContain("INSERT INTO jobs");
    expect(mockClientQuery.mock.calls[8][1]).toEqual([
      REQUEST_ID,
      mockSession.accountId,
      "reviewed",
      mockSession.userId,
      clientId,
      propertyId,
      jobId,
      null,
    ]);
  });

  it("returns 422 for invalid status", async () => {
    const res = await PATCH(makeRequest({ status: "done" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("converts a reviewed booking request when given a matching visit", async () => {
    const jobId = "33333333-3333-3333-3333-333333333333";
    const visitId = "44444444-4444-4444-4444-444444444444";
    const reviewed = { ...SAMPLE_REQUEST, status: "reviewed", job_id: jobId };
    const updated = { ...reviewed, status: "converted", visit_id: visitId };

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [reviewed] }) // SELECT booking
      .mockResolvedValueOnce({ rows: [{ id: visitId }] }) // SELECT matching visit
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE booking
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await PATCH(makeRequest({ status: "converted", visit_id: visitId }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("converted");
    expect(json.data.visit_id).toBe(visitId);
    expect(mockClientQuery.mock.calls[4][1]).toEqual([
      REQUEST_ID,
      mockSession.accountId,
      "converted",
      mockSession.userId,
      null,
      null,
      jobId,
      visitId,
    ]);
  });

  it("requires a visit_id when converting", async () => {
    const reviewed = {
      ...SAMPLE_REQUEST,
      status: "reviewed",
      job_id: "33333333-3333-3333-3333-333333333333",
    };

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [reviewed] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await PATCH(makeRequest({ status: "converted" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("blocks updates to converted booking requests", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_REQUEST, status: "converted" }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await PATCH(makeRequest({ status: "cancelled" }));

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("IMMUTABLE_ENTITY");
  });

  it("returns 404 when the booking request does not exist", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await PATCH(makeRequest({ status: "reviewed" }));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
