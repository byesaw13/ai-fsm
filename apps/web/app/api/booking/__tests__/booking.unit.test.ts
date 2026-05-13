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
const OWNER_USER_ID = "00000000-0000-0000-0000-000000000001";
const CLIENT_ID  = "11111111-1111-1111-1111-111111111111";
const PROPERTY_ID = "22222222-2222-2222-2222-222222222222";
const JOB_ID     = "33333333-3333-3333-3333-333333333333";
const BOOKING_ID = "44444444-4444-4444-4444-444444444444";

const VALID_BODY = {
  name: "Jane Client",
  email: "jane@example.com",
  phone: null,
  service_category: "general_repairs",
  service_description: "Door latch is loose and needs adjustment.",
  preferred_date: "2099-05-12",
  preferred_time_slot: "morning",
  address: "123 Main St",
  city: "Springfield",
  state: "MA",
  zip: "01103",
  access_notes: "Use side entrance.",
  preferred_contact: "email",
  sms_consent: false,
};

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
  it("creates client, property, job, and booking request but not a visit", async () => {
    const { POST } = await import("../route");

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                  // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: OWNER_USER_ID }] }) // SELECT owner/admin user
      .mockResolvedValueOnce({ rows: [] })                  // SELECT client by email → not found
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID }] }) // INSERT client
      .mockResolvedValueOnce({ rows: [] })                  // SELECT property → not found
      .mockResolvedValueOnce({ rows: [{ id: PROPERTY_ID }] }) // INSERT property
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] })   // INSERT job
      .mockResolvedValueOnce({ rows: [{ id: BOOKING_ID }] }) // INSERT booking_request
      .mockResolvedValueOnce({ rows: [] })                  // SELECT duplicate candidates
      .mockResolvedValueOnce({ rows: [] });                 // COMMIT

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      success: true,
      booking_id: BOOKING_ID,
    });

    const sql = mockClientQuery.mock.calls.map((c) => String(c[0])).join("\n");
    expect(sql).toContain("INSERT INTO clients");
    expect(sql).toContain("INSERT INTO properties");
    expect(sql).toContain("INSERT INTO jobs");
    expect(sql).toContain("INSERT INTO booking_requests");
    expect(sql).not.toContain("INSERT INTO visits");

    const brInsert = mockClientQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO booking_requests")
    );
    expect(brInsert?.[1]?.[0]).toBe(ACCOUNT_ID);   // account_id
    expect(brInsert?.[1]?.[1]).toBe(CLIENT_ID);    // client_id
    expect(brInsert?.[1]?.[2]).toBe(PROPERTY_ID);  // property_id
    expect(brInsert?.[1]?.[3]).toBe(JOB_ID);       // job_id
    expect(brInsert?.[1]?.[16]).toBe("email");     // preferred_contact
    expect(brInsert?.[1]?.[17]).toBe(false);       // sms_consent
    expect(brInsert?.[1]?.[18]).toBe("booking_form"); // sms_consent_source

    const jobInsert = mockClientQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO jobs")
    );
    expect(jobInsert?.[1]?.[6]).toBe(OWNER_USER_ID);

    const duplicateSelect = mockClientQuery.mock.calls.find((c) =>
      String(c[0]).includes("status NOT IN ('cancelled','converted')")
    );
    expect(duplicateSelect?.[1]).toEqual([
      ACCOUNT_ID,
      BOOKING_ID,
      "jane@example.com",
      null,
      "Jane Client",
    ]);
  });

  it("reuses an existing client found by email", async () => {
    const { POST } = await import("../route");

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })                    // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: OWNER_USER_ID }] }) // SELECT owner/admin user
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID }] })  // SELECT client by email → found
      .mockResolvedValueOnce({ rows: [] })                    // UPDATE contact preferences
      .mockResolvedValueOnce({ rows: [] })                    // SELECT property → not found
      .mockResolvedValueOnce({ rows: [{ id: PROPERTY_ID }] }) // INSERT property
      .mockResolvedValueOnce({ rows: [{ id: JOB_ID }] })     // INSERT job
      .mockResolvedValueOnce({ rows: [{ id: BOOKING_ID }] }) // INSERT booking_request
      .mockResolvedValueOnce({ rows: [] })                    // SELECT duplicate candidates
      .mockResolvedValueOnce({ rows: [] });                   // COMMIT

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(201);
    const sql = mockClientQuery.mock.calls.map((c) => String(c[0])).join("\n");
    expect(sql).not.toContain("INSERT INTO clients");
  });

  it("returns 503 when BOOKING_ACCOUNT_ID is not set", async () => {
    delete process.env.BOOKING_ACCOUNT_ID;
    const { POST } = await import("../route");

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(503);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid request bodies", async () => {
    const { POST } = await import("../route");

    const res = await POST(makeRequest({ name: "Jane Client", service_category: "general_repairs" }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toBe("Invalid request body");
  });
});
