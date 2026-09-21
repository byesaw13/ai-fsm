import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.LOCATION_INTERNAL_KEY = "test-key";
  process.env.LOCATION_PERSON_MAP = JSON.stringify({ nick: "user-nick" });
});

const mockApplyCompanyDayOnConnect = vi.fn();
vi.mock("@/lib/my-day/van-start-day", async () => {
  const actual = await vi.importActual<typeof import("@/lib/my-day/van-start-day")>(
    "@/lib/my-day/van-start-day",
  );
  return {
    ...actual,
    applyCompanyDayOnConnect: (...args: unknown[]) => mockApplyCompanyDayOnConnect(...args),
  };
});

const mockQueryOne = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
  queryOne: (...a: unknown[]) => mockQueryOne(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/push/send", () => ({
  sendPushToUser: vi.fn(),
  sendPushToOwners: vi.fn(),
}));

vi.mock("@/lib/field/confirm-visit", () => ({
  applyGpsPresenceToVisit: vi.fn(),
  autoRecordScheduledVisitPresence: vi.fn(),
  shouldCompleteVisitFromPresence: vi.fn(),
}));

vi.mock("@/lib/field/open-work-orders", () => ({
  listOpenWorkOrdersAtProperty: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/field/stamp-live-prompted", () => ({
  stampLivePromptedAt: vi.fn(),
}));

import { POST } from "../route";

const ACCOUNT = "aaaaaaaa-0000-0000-0000-000000000001";
const VEHICLE = "veh-ram";

function req(body: Record<string, unknown>, key = "test-key"): NextRequest {
  return new NextRequest("https://app/api/internal/location", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  });
}

function handleQuery(sql: string) {
  if (sql.includes("FROM vehicles")) return { rows: [{ id: VEHICLE }] };
  if (sql.includes("INSERT INTO location_segments")) return { rows: [{ id: "seg-1" }] };
  return { rows: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockImplementation((sql: string) => Promise.resolve(handleQuery(sql)));
  mockApplyCompanyDayOnConnect.mockResolvedValue({
    clockIn: true,
    startSession: true,
    startOdometer: 48210,
  });
  mockQueryOne.mockImplementation((sql: string) => {
    if (sql.includes("FROM accounts a JOIN users u")) {
      return Promise.resolve({ account_id: ACCOUNT });
    }
    if (sql.includes("location_tracking_enabled")) {
      return Promise.resolve({ enabled: true, paused: false, active_session: false });
    }
    return Promise.resolve(null);
  });
});

describe("POST /api/internal/location — van connect starts the company day", () => {
  it("does not drop vehicle_connect when no mileage session is open yet", async () => {
    const res = await POST(
      req({
        kind: "vehicle_connect",
        vehicle_bluetooth: "AA:BB:CC:DD:EE:FF",
        person: "Nick",
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBeUndefined();
    expect(json.ok).toBe(true);
  });

  it("clocks the mapped person in after the vehicle resolves", async () => {
    const res = await POST(
      req({
        kind: "vehicle_connect",
        vehicle_bluetooth: "AA:BB:CC:DD:EE:FF",
        person: "Nick",
        occurred_at: "2026-09-21T12:00:00.000Z",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockApplyCompanyDayOnConnect).toHaveBeenCalledOnce();
    expect(mockApplyCompanyDayOnConnect).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: ACCOUNT,
        userId: "user-nick",
        vehicleId: VEHICLE,
        sessionDate: "2026-09-21",
      }),
    );
  });

  it("skips company-day start when the person cannot be mapped", async () => {
    const res = await POST(
      req({
        kind: "vehicle_connect",
        vehicle_bluetooth: "AA:BB:CC:DD:EE:FF",
        person: "unknown-tech",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockApplyCompanyDayOnConnect).not.toHaveBeenCalled();
  });

  it("does not start the company day on GPS or disconnect", async () => {
    mockQueryOne.mockImplementation((sql: string) => {
      if (sql.includes("FROM accounts a JOIN users u")) {
        return Promise.resolve({ account_id: ACCOUNT });
      }
      if (sql.includes("location_tracking_enabled")) {
        return Promise.resolve({ enabled: true, paused: false, active_session: true });
      }
      return Promise.resolve(null);
    });

    await POST(req({ kind: "location_update", latitude: 42.8, longitude: -71.3, person: "Nick" }));
    await POST(req({ kind: "vehicle_disconnect", person: "Nick" }));
    expect(mockApplyCompanyDayOnConnect).not.toHaveBeenCalled();
  });

  it("still drops GPS when there is no workday session", async () => {
    const res = await POST(
      req({ kind: "location_update", latitude: 42.8, longitude: -71.3, person: "Nick" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "no_active_workday" });
    expect(mockApplyCompanyDayOnConnect).not.toHaveBeenCalled();
  });
});
