import { describe, expect, it } from "vitest";
import { deriveValidTransitions } from "../state";

const base = {
  business_day: null,
  clocked_in: false,
  clock: null,
  activity: null,
  vehicle_session: null,
} as const;

describe("deriveValidTransitions", () => {
  it("offers open day, clock in, and start mileage when nothing is open", () => {
    expect(deriveValidTransitions(base)).toEqual([
      "open_business_day",
      "clock_in",
      "start_mileage_session",
    ]);
  });

  it("offers close day and reopen paths based on business day status", () => {
    expect(
      deriveValidTransitions({
        ...base,
        business_day: { id: "d1", status: "ACTIVE" },
      }),
    ).toContain("close_business_day");

    expect(
      deriveValidTransitions({
        ...base,
        business_day: { id: "d1", status: "CLOSED" },
      }),
    ).toEqual(["reopen_business_day", "clock_in", "start_mileage_session"]);
  });

  it("offers clock out and switch activity when clocked in", () => {
    const t = deriveValidTransitions({
      ...base,
      business_day: { id: "d1", status: "ACTIVE" },
      clocked_in: true,
      clock: { id: "c1", clock_in_at: "2026-07-06T08:00:00Z" },
    });
    expect(t).toContain("clock_out");
    expect(t).toContain("switch_activity");
    expect(t).not.toContain("clock_in");
  });

  it("offers close mileage when a vehicle session is open", () => {
    const t = deriveValidTransitions({
      ...base,
      business_day: { id: "d1", status: "ACTIVE" },
      vehicle_session: { id: "v1", vehicle_id: "veh1", started_at: "2026-07-06T08:00:00Z" },
    });
    expect(t).toContain("close_mileage_session");
    expect(t).not.toContain("start_mileage_session");
  });
});