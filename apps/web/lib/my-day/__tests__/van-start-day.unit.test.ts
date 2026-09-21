import { describe, it, expect, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  applyCompanyDayOnConnect,
  locationEventDropReason,
  shouldStartCompanyDayOnEvent,
  startCompanyDayOnConnect,
} from "../van-start-day";

const VEHICLE = "veh-ram";

describe("startCompanyDayOnConnect — van connect is Start day", () => {
  it("does nothing when no vehicle resolved (drive segment still opens elsewhere)", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: false,
        vehicleId: null,
        lastOdometer: 48210,
      }),
    ).toEqual({ clockIn: false, startSession: false, startOdometer: null });
  });

  it("clocks in only when last odometer is missing — does not invent miles", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: false,
        vehicleId: VEHICLE,
        lastOdometer: null,
      }),
    ).toEqual({ clockIn: true, startSession: false, startOdometer: null });
  });

  it("clocks in only when last odometer is invalid", () => {
    for (const lastOdometer of [-1, 12.5, Number.NaN]) {
      expect(
        startCompanyDayOnConnect({
          alreadyClockedIn: false,
          hasOpenSession: false,
          vehicleId: VEHICLE,
          lastOdometer,
        }),
      ).toEqual({ clockIn: true, startSession: false, startOdometer: null });
    }
  });

  it("clocks in and starts a session at last odometer when known and none is open", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: false,
        vehicleId: VEHICLE,
        lastOdometer: 48210,
      }),
    ).toEqual({ clockIn: true, startSession: true, startOdometer: 48210 });
  });

  it("starts a session at last odometer even when already clocked in", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: true,
        hasOpenSession: false,
        vehicleId: VEHICLE,
        lastOdometer: 48210,
      }),
    ).toEqual({ clockIn: true, startSession: true, startOdometer: 48210 });
  });

  it("is a no-op when already clocked in and a session is open", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: true,
        hasOpenSession: true,
        vehicleId: VEHICLE,
        lastOdometer: 48210,
      }),
    ).toEqual({ clockIn: false, startSession: false, startOdometer: null });
  });

  it("clocks in only when the van session is already open (no second session)", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: true,
        vehicleId: VEHICLE,
        lastOdometer: 48210,
      }),
    ).toEqual({ clockIn: true, startSession: false, startOdometer: null });
  });

  it("does not invent miles when already clocked in but odometer is unknown", () => {
    expect(
      startCompanyDayOnConnect({
        alreadyClockedIn: true,
        hasOpenSession: false,
        vehicleId: VEHICLE,
        lastOdometer: null,
      }),
    ).toEqual({ clockIn: false, startSession: false, startOdometer: null });
  });

  it("never clocks out, never closes the day, never starts job_work labor", () => {
    const cases = [
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: false,
        vehicleId: VEHICLE,
        lastOdometer: 48210,
      }),
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: false,
        vehicleId: VEHICLE,
        lastOdometer: null,
      }),
      startCompanyDayOnConnect({
        alreadyClockedIn: true,
        hasOpenSession: true,
        vehicleId: VEHICLE,
        lastOdometer: 48210,
      }),
      startCompanyDayOnConnect({
        alreadyClockedIn: false,
        hasOpenSession: false,
        vehicleId: null,
        lastOdometer: 48210,
      }),
    ];
    for (const action of cases) {
      expect(action).not.toHaveProperty("clockOut");
      expect(action).not.toHaveProperty("closeDay");
      expect(action).not.toHaveProperty("startJobWork");
      expect(Object.keys(action).sort()).toEqual(["clockIn", "startOdometer", "startSession"]);
    }
  });
});

describe("shouldStartCompanyDayOnEvent", () => {
  it("starts the company day only on vehicle_connect", () => {
    expect(shouldStartCompanyDayOnEvent("vehicle_connect")).toBe(true);
  });

  it("does not start the day on disconnect (disconnect is not Close Day)", () => {
    expect(shouldStartCompanyDayOnEvent("vehicle_disconnect")).toBe(false);
  });

  it("does not start the day on GPS pings", () => {
    expect(shouldStartCompanyDayOnEvent("location_update")).toBe(false);
    expect(shouldStartCompanyDayOnEvent("activity_change")).toBe(false);
    expect(shouldStartCompanyDayOnEvent("zone_enter")).toBe(false);
    expect(shouldStartCompanyDayOnEvent("zone_leave")).toBe(false);
  });
});

describe("locationEventDropReason — connect is allowed to start the workday", () => {
  it("lets vehicle_connect through when tracking is on even with no mileage session", () => {
    expect(
      locationEventDropReason({
        enabled: true,
        paused: false,
        activeSession: false,
        kind: "vehicle_connect",
      }),
    ).toBeNull();
  });

  it("still drops GPS when there is no workday session", () => {
    expect(
      locationEventDropReason({
        enabled: true,
        paused: false,
        activeSession: false,
        kind: "location_update",
      }),
    ).toBe("no_active_workday");
  });

  it("does not treat disconnect as start-day (no workday bypass)", () => {
    expect(
      locationEventDropReason({
        enabled: true,
        paused: false,
        activeSession: false,
        kind: "vehicle_disconnect",
      }),
    ).toBe("no_active_workday");
  });

  it("still honors tracking disabled and pause, including on connect", () => {
    expect(
      locationEventDropReason({
        enabled: false,
        paused: false,
        activeSession: false,
        kind: "vehicle_connect",
      }),
    ).toBe("tracking_disabled");
    expect(
      locationEventDropReason({
        enabled: true,
        paused: true,
        activeSession: false,
        kind: "vehicle_connect",
      }),
    ).toBe("paused");
  });

  it("lets GPS through once a workday session is open", () => {
    expect(
      locationEventDropReason({
        enabled: true,
        paused: false,
        activeSession: true,
        kind: "location_update",
      }),
    ).toBeNull();
  });
});

function mockClient(): PoolClient {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
}

describe("applyCompanyDayOnConnect — orchestration", () => {
  it("does not read clock or odometer when no vehicle is resolved", async () => {
    const getOpenClock = vi.fn();
    const lastKnownOdometer = vi.fn();
    const findOpenSessionForVehicle = vi.fn();
    const clockIn = vi.fn();
    const startOpenVehicleSession = vi.fn();

    const action = await applyCompanyDayOnConnect(
      mockClient(),
      { accountId: "acct", userId: "user", vehicleId: null },
      { getOpenClock, lastKnownOdometer, findOpenSessionForVehicle, clockIn, startOpenVehicleSession },
    );

    expect(action).toEqual({ clockIn: false, startSession: false, startOdometer: null });
    expect(getOpenClock).not.toHaveBeenCalled();
    expect(lastKnownOdometer).not.toHaveBeenCalled();
    expect(clockIn).not.toHaveBeenCalled();
    expect(startOpenVehicleSession).not.toHaveBeenCalled();
  });

  it("clocks in and starts a session at last known odometer", async () => {
    const clockIn = vi.fn().mockResolvedValue({ alreadyOpen: false, clock: { id: "c1" } });
    const startOpenVehicleSession = vi.fn().mockResolvedValue({ id: "sess-1" });

    const action = await applyCompanyDayOnConnect(
      mockClient(),
      { accountId: "acct", userId: "user", vehicleId: VEHICLE, sessionDate: "2026-09-21" },
      {
        getOpenClock: vi.fn().mockResolvedValue(null),
        findOpenSessionForVehicle: vi.fn().mockResolvedValue(null),
        lastKnownOdometer: vi.fn().mockResolvedValue(48210),
        clockIn,
        startOpenVehicleSession,
      },
    );

    expect(action).toEqual({ clockIn: true, startSession: true, startOdometer: 48210 });
    expect(clockIn).toHaveBeenCalledOnce();
    expect(startOpenVehicleSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: "acct",
        userId: "user",
        vehicleId: VEHICLE,
        sessionDate: "2026-09-21",
        startOdometer: 48210,
      }),
    );
  });

  it("clocks in only when last odometer is unknown", async () => {
    const clockIn = vi.fn().mockResolvedValue({ alreadyOpen: false, clock: { id: "c1" } });
    const startOpenVehicleSession = vi.fn();

    await applyCompanyDayOnConnect(
      mockClient(),
      { accountId: "acct", userId: "user", vehicleId: VEHICLE },
      {
        getOpenClock: vi.fn().mockResolvedValue(null),
        findOpenSessionForVehicle: vi.fn().mockResolvedValue(null),
        lastKnownOdometer: vi.fn().mockResolvedValue(null),
        clockIn,
        startOpenVehicleSession,
      },
    );

    expect(clockIn).toHaveBeenCalledOnce();
    expect(startOpenVehicleSession).not.toHaveBeenCalled();
  });

  it("is a no-op when already clocked in with an open session", async () => {
    const clockIn = vi.fn();
    const startOpenVehicleSession = vi.fn();
    const clockOut = vi.fn();

    await applyCompanyDayOnConnect(
      mockClient(),
      { accountId: "acct", userId: "user", vehicleId: VEHICLE },
      {
        getOpenClock: vi.fn().mockResolvedValue({ id: "c1" }),
        findOpenSessionForVehicle: vi.fn().mockResolvedValue({ id: "s1" }),
        lastKnownOdometer: vi.fn().mockResolvedValue(48210),
        clockIn,
        startOpenVehicleSession,
      },
    );

    expect(clockIn).not.toHaveBeenCalled();
    expect(startOpenVehicleSession).not.toHaveBeenCalled();
    expect(clockOut).not.toHaveBeenCalled();
  });

  it("never starts job_work labor", async () => {
    const startJobWork = vi.fn();
    await applyCompanyDayOnConnect(
      mockClient(),
      { accountId: "acct", userId: "user", vehicleId: VEHICLE },
      {
        getOpenClock: vi.fn().mockResolvedValue(null),
        findOpenSessionForVehicle: vi.fn().mockResolvedValue(null),
        lastKnownOdometer: vi.fn().mockResolvedValue(48210),
        clockIn: vi.fn().mockResolvedValue({ alreadyOpen: false, clock: { id: "c1" } }),
        startOpenVehicleSession: vi.fn().mockResolvedValue({ id: "s1" }),
      },
    );
    expect(startJobWork).not.toHaveBeenCalled();
  });
});
