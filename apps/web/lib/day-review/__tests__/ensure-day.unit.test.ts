import { describe, expect, it } from "vitest";
import { shouldOpenBusinessDay } from "../ensure-day";

describe("shouldOpenBusinessDay", () => {
  it("opens a closeable day when a mileage session exists even without a cashier clock-in", () => {
    expect(
      shouldOpenBusinessDay({ hasVehicleSession: true, hasClock: false, hasVisits: false }),
    ).toBe(true);
  });

  it("opens a day when they clocked in", () => {
    expect(
      shouldOpenBusinessDay({ hasVehicleSession: false, hasClock: true, hasVisits: false }),
    ).toBe(true);
  });

  it("stays empty when there is no work", () => {
    expect(
      shouldOpenBusinessDay({ hasVehicleSession: false, hasClock: false, hasVisits: false }),
    ).toBe(false);
  });
});
