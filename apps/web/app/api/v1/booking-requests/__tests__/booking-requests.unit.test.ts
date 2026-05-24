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

import { POST as QuickLeadPOST } from "../route";
import { PATCH } from "../[id]/route";
import { POST as RepairPOST } from "../[id]/repair/route";

const REQUEST_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROPERTY_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const JOB_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
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
  it("quick lead POST creates linked pipeline records", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // SELECT client by phone
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID }] }) // INSERT client
      .mockResolvedValueOnce({ rows: [] }) // SELECT property
      .mockResolvedValueOnce({ rows: [{ id: PROPERTY_ID }] }) // INSERT property
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] }) // INSERT job
      .mockResolvedValueOnce({ rows: [{ id: REQUEST_ID }] }) // INSERT booking_request
      .mockResolvedValueOnce({ rows: [] }) // SELECT duplicates
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await QuickLeadPOST(new NextRequest("http://localhost:3000/api/v1/booking-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Quick Lead",
        phone: "555-0100",
        service_description: "Caller needs a loose door adjusted.",
      }),
    }));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: REQUEST_ID,
      clientId: CLIENT_ID,
      propertyId: PROPERTY_ID,
      jobId: JOB_ID,
    });

    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sql).toContain("INSERT INTO clients");
    expect(sql).toContain("INSERT INTO properties");
    expect(sql).toContain("INSERT INTO jobs");
    expect(sql).toContain("INSERT INTO booking_requests");

    const bookingInsert = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO booking_requests")
    );
    expect(bookingInsert?.[1]?.[1]).toBe(CLIENT_ID);
    expect(bookingInsert?.[1]?.[2]).toBe(PROPERTY_ID);
    expect(bookingInsert?.[1]?.[3]).toBe(JOB_ID);
    expect(bookingInsert?.[1]?.[7]).toBe("general_repairs");
    expect(bookingInsert?.[1]?.[11]).toBe("TBD");
  });

  it("repair POST creates missing pipeline links for orphan booking requests", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({
        rows: [{
          id: REQUEST_ID,
          status: "pending",
          client_id: null,
          property_id: null,
          job_id: null,
          name: "Orphan Lead",
          email: "orphan@example.com",
          phone: "555-0199",
          service_category: "general",
          service_description: "Old quick lead needs pipeline repair.",
          preferred_date: "2099-05-12",
          preferred_time_slot: "flexible",
          address: "TBD",
          city: null,
          state: null,
          zip: null,
          access_notes: null,
          preferred_contact: "phone",
          sms_consent: false,
        }],
      }) // SELECT booking request FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // SELECT client by email
      .mockResolvedValueOnce({ rows: [] }) // SELECT client by phone
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID }] }) // INSERT client
      .mockResolvedValueOnce({ rows: [] }) // SELECT property
      .mockResolvedValueOnce({ rows: [{ id: PROPERTY_ID }] }) // INSERT property
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] }) // INSERT job
      .mockResolvedValueOnce({ rows: [] }) // UPDATE booking request
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await RepairPOST(new NextRequest(`${BASE}/repair`, { method: "POST" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      data: {
        bookingId: REQUEST_ID,
        clientId: CLIENT_ID,
        propertyId: PROPERTY_ID,
        jobId: JOB_ID,
      },
    });

    const sql = mockClientQuery.mock.calls.map((call) => String(call[0])).join("\n");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("INSERT INTO clients");
    expect(sql).toContain("INSERT INTO properties");
    expect(sql).toContain("INSERT INTO jobs");
    expect(sql).toContain("UPDATE booking_requests");

    const updateCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE booking_requests")
    );
    expect(updateCall?.[1]).toEqual([
      REQUEST_ID,
      mockSession.accountId,
      CLIENT_ID,
      PROPERTY_ID,
      JOB_ID,
    ]);
  });

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
