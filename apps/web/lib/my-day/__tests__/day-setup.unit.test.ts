import { describe, it, expect } from "vitest";
import { isDaySetupComplete, nextIncompleteStep } from "../day-setup";

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