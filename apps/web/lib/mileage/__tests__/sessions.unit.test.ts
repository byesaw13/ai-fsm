import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  SUSPICIOUS_SESSION_MILES,
  completedSessionMiles,
  dailyMileageTotal,
  findOpenSessionForVehicle,
  isSuspiciousMiles,
  lastKnownOdometer,
  summarizeDayMileage,
  validateStartOdometer,
  type VehicleSessionRow,
} from "../sessions";

function mockClient(rows: unknown[]): PoolClient {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as PoolClient;
}

describe("validateStartOdometer — mileage cannot go backward", () => {
  it("accepts a start at or above the last known reading", () => {
    expect(validateStartOdometer(5000, 5000)).toEqual({ ok: true });
    expect(validateStartOdometer(5000, 5200)).toEqual({ ok: true });
  });

  it("rejects a start below the last known reading", () => {
    expect(validateStartOdometer(5000, 4800)).toEqual({ ok: false, code: "ODOMETER_TOO_LOW", lastKnown: 5000 });
  });

  it("allows a backward start under an explicit correction", () => {
    expect(validateStartOdometer(5000, 4800, { correction: true })).toEqual({ ok: true });
  });

  it("accepts any start when the vehicle has no history", () => {
    expect(validateStartOdometer(null, 0)).toEqual({ ok: true });
  });
});

describe("isSuspiciousMiles", () => {
  it("flags spans beyond the threshold", () => {
    expect(isSuspiciousMiles(1000, 1000 + SUSPICIOUS_SESSION_MILES + 1)).toBe(true);
    expect(isSuspiciousMiles(1000, 1000 + SUSPICIOUS_SESSION_MILES)).toBe(false);
  });
});

describe("completedSessionMiles / dailyMileageTotal — daily total across vehicles", () => {
  it("ignores open sessions and sums completed ones across vehicles", () => {
    const sessions = [
      { miles: null, start_odometer: 100, end_odometer: 140 }, // Ram, 40 mi
      { miles: 25, start_odometer: 5000, end_odometer: 5025 }, // Pathfinder, 25 mi (stored)
      { miles: null, start_odometer: 200, end_odometer: null }, // open — contributes 0
    ];
    expect(completedSessionMiles(sessions[0])).toBe(40);
    expect(completedSessionMiles(sessions[2])).toBeNull();
    expect(dailyMileageTotal(sessions)).toBe(65);
  });
});

describe("summarizeDayMileage — Daily Operations Log rollup", () => {
  function row(over: Partial<VehicleSessionRow>): VehicleSessionRow {
    return {
      vehicle_id: null,
      vehicle_nickname: null,
      vehicle_plate: null,
      miles: null,
      start_odometer: null,
      end_odometer: null,
      ...over,
    };
  }

  it("totals completed miles across vehicles and breaks down per vehicle", () => {
    const rows = [
      row({ vehicle_id: "ram", vehicle_nickname: "Ram 1500", vehicle_plate: "ABC", start_odometer: 100, end_odometer: 140 }), // 40
      row({ vehicle_id: "path", vehicle_nickname: "Pathfinder", vehicle_plate: "XYZ", miles: 25 }),                              // 25
      row({ vehicle_id: "ram", vehicle_nickname: "Ram 1500", vehicle_plate: "ABC", start_odometer: 140, end_odometer: 150 }),   // 10
      row({ vehicle_id: "ram", vehicle_nickname: "Ram 1500", vehicle_plate: "ABC", start_odometer: 150, end_odometer: null }),  // open
    ];
    const summary = summarizeDayMileage(rows);
    expect(summary.totalMiles).toBe(75);
    expect(summary.completedSessions).toBe(3);
    expect(summary.openSessions).toBe(1);
    // ordered by miles desc: Ram (50) before Pathfinder (25)
    expect(summary.perVehicle.map((v) => [v.nickname, v.miles, v.sessions])).toEqual([
      ["Ram 1500", 50, 2],
      ["Pathfinder", 25, 1],
    ]);
  });

  it("handles an empty day", () => {
    expect(summarizeDayMileage([])).toEqual({
      totalMiles: 0,
      completedSessions: 0,
      openSessions: 0,
      perVehicle: [],
    });
  });
});

describe("lastKnownOdometer — per-vehicle history", () => {
  it("returns the monotonic max across the vehicle's readings", async () => {
    const client = mockClient([{ last_known: 8421 }]);
    const result = await lastKnownOdometer(client, "acct", "veh");
    expect(result).toBe(8421);
  });

  it("returns null for a vehicle with no sessions", async () => {
    const client = mockClient([{ last_known: null }]);
    expect(await lastKnownOdometer(client, "acct", "veh")).toBeNull();
  });
});

describe("findOpenSessionForVehicle", () => {
  it("returns the open prior session when one exists", async () => {
    const client = mockClient([{ id: "open-1", start_odometer: 100, session_date: "2026-06-13" }]);
    expect(await findOpenSessionForVehicle(client, "acct", "veh")).toEqual({
      id: "open-1",
      start_odometer: 100,
      session_date: "2026-06-13",
    });
  });

  it("returns null when the vehicle has no open session", async () => {
    const client = mockClient([]);
    expect(await findOpenSessionForVehicle(client, "acct", "veh")).toBeNull();
  });
});
