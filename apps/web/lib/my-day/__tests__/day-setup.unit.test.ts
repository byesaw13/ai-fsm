import { describe, it, expect } from "vitest";
import { isDaySetupComplete, nextIncompleteStep, priorDayNeedsMileage, startDayMode } from "../day-setup";

describe("day-setup", () => {
  it("complete when all three true", () => {
    expect(isDaySetupComplete({ clockedIn: true, hasOpenSession: true, vehicleReady: true })).toBe(true);
  });
  it("complete when the van is already on, even without a cashier clock-in", () => {
    expect(isDaySetupComplete({ clockedIn: false, hasOpenSession: true, vehicleReady: true })).toBe(true);
  });
  it("incomplete when the van session is not open", () => {
    expect(isDaySetupComplete({ clockedIn: true, hasOpenSession: false, vehicleReady: true })).toBe(false);
  });
  it("next step is clock first", () => {
    expect(nextIncompleteStep({ clockedIn: false, hasOpenSession: false, vehicleReady: false })).toBe("clock");
  });
  it("skips cashier clock-in when the van session is already open", () => {
    expect(nextIncompleteStep({ clockedIn: false, hasOpenSession: true, vehicleReady: true })).toBeNull();
  });
  it("next step is vehicle when clocked in", () => {
    expect(nextIncompleteStep({ clockedIn: true, hasOpenSession: false, vehicleReady: false })).toBe("vehicle");
  });
  it("next step is mileage when vehicle ready", () => {
    expect(nextIncompleteStep({ clockedIn: true, hasOpenSession: false, vehicleReady: true })).toBe("mileage");
  });
  it("null when complete", () => {
    expect(nextIncompleteStep({ clockedIn: true, hasOpenSession: true, vehicleReady: true })).toBeNull();
  });
});

describe("startDayMode", () => {
  it("is done when clock and mileage session are already open", () => {
    expect(
      startDayMode({
        clockedIn: true,
        hasOpenSession: true,
        hasVehicle: true,
        lastOdometer: 48210,
      }),
    ).toBe("done");
  });
  it("is done when the van is already on even if payroll clock has not refreshed", () => {
    expect(
      startDayMode({
        clockedIn: false,
        hasOpenSession: true,
        hasVehicle: true,
        lastOdometer: 48210,
      }),
    ).toBe("done");
  });
  it("one-taps when the last truck odometer is known", () => {
    expect(
      startDayMode({
        clockedIn: false,
        hasOpenSession: false,
        hasVehicle: true,
        lastOdometer: 48210,
      }),
    ).toBe("one_tap");
  });
  it("asks only for odometer when the truck is known but miles are not", () => {
    expect(
      startDayMode({
        clockedIn: false,
        hasOpenSession: false,
        hasVehicle: true,
        lastOdometer: null,
      }),
    ).toBe("odometer");
  });
  it("falls back to the wizard when there is no truck", () => {
    expect(
      startDayMode({
        clockedIn: false,
        hasOpenSession: false,
        hasVehicle: false,
        lastOdometer: null,
      }),
    ).toBe("wizard");
  });

  it("asks for miles before a new day when yesterday was worked and never closed", () => {
    expect(
      startDayMode({
        clockedIn: false,
        hasOpenSession: false,
        hasVehicle: true,
        lastOdometer: 48210,
        priorDayNeedsMileage: true,
      }),
    ).toBe("odometer");
  });
});

describe("priorDayNeedsMileage", () => {
  it("is true when an open session is from before today", () => {
    expect(
      priorDayNeedsMileage({
        today: "2026-09-21",
        priorOpenSessionDate: "2026-09-20",
        lastWorkedDate: "2026-09-20",
        lastEndedMileageDate: "2026-09-19",
      }),
    ).toBe(true);
  });

  it("is true when they worked after the last closing reading", () => {
    expect(
      priorDayNeedsMileage({
        today: "2026-09-21",
        priorOpenSessionDate: null,
        lastWorkedDate: "2026-09-20",
        lastEndedMileageDate: "2026-09-18",
      }),
    ).toBe(true);
  });

  it("is false when yesterday already has a closing reading", () => {
    expect(
      priorDayNeedsMileage({
        today: "2026-09-21",
        priorOpenSessionDate: null,
        lastWorkedDate: "2026-09-20",
        lastEndedMileageDate: "2026-09-20",
      }),
    ).toBe(false);
  });

  it("is false when they have not worked since the last close", () => {
    expect(
      priorDayNeedsMileage({
        today: "2026-09-21",
        priorOpenSessionDate: null,
        lastWorkedDate: "2026-09-18",
        lastEndedMileageDate: "2026-09-18",
      }),
    ).toBe(false);
  });

  it("is false when there is no prior work", () => {
    expect(
      priorDayNeedsMileage({
        today: "2026-09-21",
        priorOpenSessionDate: null,
        lastWorkedDate: null,
        lastEndedMileageDate: null,
      }),
    ).toBe(false);
  });
});