import { describe, it, expect } from "vitest";
import { isDaySetupComplete, nextIncompleteStep, startDayMode } from "../day-setup";

describe("day-setup", () => {
  it("complete when all three true", () => {
    expect(isDaySetupComplete({ clockedIn: true, hasOpenSession: true, vehicleReady: true })).toBe(true);
  });
  it("incomplete when clock missing", () => {
    expect(isDaySetupComplete({ clockedIn: false, hasOpenSession: true, vehicleReady: true })).toBe(false);
  });
  it("next step is clock first", () => {
    expect(nextIncompleteStep({ clockedIn: false, hasOpenSession: false, vehicleReady: false })).toBe("clock");
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
});