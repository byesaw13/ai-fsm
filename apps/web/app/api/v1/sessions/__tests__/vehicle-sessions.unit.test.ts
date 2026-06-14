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

vi.mock("@/lib/db", () => ({ getPool: () => mockPool }));
vi.mock("@/lib/db/audit", () => ({ appendAuditLog: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { POST as startSession } from "../start/route";
import { POST as switchVehicle } from "../switch/route";
import { POST as correctVehicle } from "../[id]/correct-vehicle/route";

const VEHICLE_A = "11111111-1111-1111-1111-111111111111";
const VEHICLE_B = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";

function request(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe("POST /api/v1/sessions/start — odometer floor", () => {
  it("rejects a start below the vehicle's last known reading (mileage cannot go backward)", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: VEHICLE_A }] }) // vehicle exists
      .mockResolvedValueOnce({ rows: [] }) // findOpenSessionForVehicle → none
      .mockResolvedValueOnce({ rows: [{ last_known: 5000 }] }); // lastKnownOdometer

    const res = await startSession(request("POST", "http://localhost/api/v1/sessions/start", { vehicle_id: VEHICLE_A, start_odometer: 4800 }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("ODOMETER_TOO_LOW");
    expect(json.error.last_known_odometer).toBe(5000);
  });

  it("allows a backward start with an explicit correction reason", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: VEHICLE_A }] }) // vehicle exists
      .mockResolvedValueOnce({ rows: [] }) // findOpenSessionForVehicle → none
      .mockResolvedValueOnce({ rows: [{ last_known: 5000 }] }) // lastKnownOdometer
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, session_date: "2026-06-14", vehicle_id: VEHICLE_A, start_odometer: 4800 }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await startSession(request("POST", "http://localhost/api/v1/sessions/start", { vehicle_id: VEHICLE_A, start_odometer: 4800, correction: true, correction_reason: "odometer mis-read yesterday" }));
    expect(res.status).toBe(201);
  });

  it("prompts to close an incomplete prior session for the same vehicle", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: VEHICLE_A }] }) // vehicle exists
      .mockResolvedValueOnce({ rows: [{ id: "open-prior", start_odometer: 100, session_date: "2026-06-13" }] }); // open prior

    const res = await startSession(request("POST", "http://localhost/api/v1/sessions/start", { vehicle_id: VEHICLE_A, start_odometer: 500 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("INCOMPLETE_PRIOR_SESSION");
    expect(json.error.open_session_id).toBe("open-prior");
    expect(json.error.suggested_end_odometer).toBe(500);
  });
});

describe("POST /api/v1/sessions/switch — vehicle switch same day", () => {
  it("closes the current session and opens a new one without ending the work day", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, vehicle_id: VEHICLE_A, session_date: "2026-06-14", start_odometer: 1000, end_odometer: null }] }) // current FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // UPDATE close current
      .mockResolvedValueOnce({ rows: [{ id: VEHICLE_B }] }) // new vehicle exists
      .mockResolvedValueOnce({ rows: [] }) // findOpenSessionForVehicle(new) → none
      .mockResolvedValueOnce({ rows: [{ last_known: 2000 }] }) // lastKnownOdometer(new)
      .mockResolvedValueOnce({ rows: [{ id: "new-session", session_date: "2026-06-14", vehicle_id: VEHICLE_B, start_odometer: 2000 }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await switchVehicle(request("POST", "http://localhost/api/v1/sessions/switch", {
      close_session_id: SESSION_ID,
      end_odometer: 1200,
      new_vehicle_id: VEHICLE_B,
      new_start_odometer: 2000,
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe("new-session");

    // The work day must keep running: no activity_entries are touched.
    const touchedActivities = mockClientQuery.mock.calls.some(([sql]) => typeof sql === "string" && sql.includes("activity_entries"));
    expect(touchedActivities).toBe(false);
  });

  it("rejects an end odometer that is not greater than the current start", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, vehicle_id: VEHICLE_A, session_date: "2026-06-14", start_odometer: 1000, end_odometer: null }] }); // current

    const res = await switchVehicle(request("POST", "http://localhost/api/v1/sessions/switch", {
      close_session_id: SESSION_ID,
      end_odometer: 900,
      new_vehicle_id: VEHICLE_B,
      new_start_odometer: 2000,
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("greater than start");
  });
});

describe("POST /api/v1/sessions/[id]/correct-vehicle — wrong vehicle correction", () => {
  const url = `http://localhost/api/v1/sessions/${SESSION_ID}/correct-vehicle`;

  it("requires a reason to change the vehicle on a completed session", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, vehicle_id: VEHICLE_A, start_odometer: 100, end_odometer: 200 }] }); // existing (completed)

    const res = await correctVehicle(request("POST", url, { vehicle_id: VEHICLE_B }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("REASON_REQUIRED");
  });

  it("reassigns a completed session to the new vehicle with a reason and recomputes miles", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, vehicle_id: VEHICLE_A, start_odometer: 100, end_odometer: 200 }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: VEHICLE_B }] }) // new vehicle exists
      .mockResolvedValueOnce({ rows: [{ last_known: 50 }] }) // lastKnownOdometer(new)
      .mockResolvedValueOnce({ rows: [{ id: SESSION_ID, session_date: "2026-06-14", vehicle_id: VEHICLE_B, start_odometer: 100, end_odometer: 200, miles: "100" }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await correctVehicle(request("POST", url, { vehicle_id: VEHICLE_B, correction_reason: "wrong vehicle selected" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.vehicle_id).toBe(VEHICLE_B);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("vehicle_id = $1"),
      expect.arrayContaining([VEHICLE_B, 100, 200, 100]),
    );
  });
});
