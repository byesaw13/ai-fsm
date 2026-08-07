import { describe, it, expect } from "vitest";
import {
  computeServiceNextDue,
  computeRenewalDueStatus,
  shouldFlagSuspectOdometer,
} from "./vehicle-next-due";

describe("vehicle-next-due (TASK-093)", () => {
  it("uses min of miles and months windows", () => {
    const r = computeServiceNextDue({
      schedule: {
        serviceType: "oil_change",
        intervalMiles: 5000,
        intervalMonths: 6,
        isActive: true,
      },
      records: [
        {
          servicedAt: "2026-01-01",
          odometer: 80000,
          odometerSuspect: false,
          serviceTypes: ["oil_change"],
        },
      ],
      currentOdometer: 84000,
      today: "2026-04-01",
    });
    expect(r.dueOdometer).toBe(85000);
    expect(r.milesRemaining).toBe(1000);
    expect(r.dueDate).toBe("2026-07-01");
    expect(r.status).toBe("ok");
  });

  it("flags overdue by miles", () => {
    const r = computeServiceNextDue({
      schedule: {
        serviceType: "oil_change",
        intervalMiles: 5000,
        intervalMonths: null,
        isActive: true,
      },
      records: [
        {
          servicedAt: "2026-01-01",
          odometer: 80000,
          odometerSuspect: false,
          serviceTypes: ["oil_change"],
        },
      ],
      currentOdometer: 86000,
      today: "2026-04-01",
    });
    expect(r.status).toBe("overdue");
    expect(r.milesRemaining).toBe(-1000);
  });

  it("excludes suspect last-done", () => {
    const r = computeServiceNextDue({
      schedule: {
        serviceType: "oil_change",
        intervalMiles: 5000,
        intervalMonths: null,
        isActive: true,
      },
      records: [
        {
          servicedAt: "2026-02-01",
          odometer: 82000,
          odometerSuspect: true,
          serviceTypes: ["oil_change"],
        },
        {
          servicedAt: "2026-01-01",
          odometer: 80000,
          odometerSuspect: false,
          serviceTypes: ["oil_change"],
        },
      ],
      currentOdometer: 82000,
      today: "2026-04-01",
    });
    expect(r.dueOdometer).toBe(85000);
  });

  it("renewal due_soon / overdue", () => {
    expect(
      computeRenewalDueStatus({
        renewal: { renewalType: "registration", currentDueDate: "2026-04-10", isActive: true },
        today: "2026-04-01",
      }).status,
    ).toBe("due_soon");
    expect(
      computeRenewalDueStatus({
        renewal: { renewalType: "registration", currentDueDate: "2026-03-01", isActive: true },
        today: "2026-04-01",
      }).status,
    ).toBe("overdue");
  });

  it("soft-flags odometer lower than last known", () => {
    expect(shouldFlagSuspectOdometer(100, 200)).toBe(true);
    expect(shouldFlagSuspectOdometer(250, 200)).toBe(false);
  });
});
