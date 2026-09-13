import { describe, expect, it } from "vitest";
import { groupMileageMonth, type MileageMonthSession } from "../mileage-month";

function s(partial: Partial<MileageMonthSession> & Pick<MileageMonthSession, "id" | "session_date">): MileageMonthSession {
  return {
    miles: 0,
    miles_source: "odometer",
    status: "closed",
    start_odometer: null,
    end_odometer: null,
    notes: null,
    tagged: false,
    ...partial,
  };
}

describe("groupMileageMonth", () => {
  it("uses odometer as claim and does not add GPS hops to the headline", () => {
    const summary = groupMileageMonth([
      s({ id: "o", session_date: "2026-09-10", miles: 71, miles_source: "odometer" }),
      s({ id: "g1", session_date: "2026-09-10", miles: 15.5, miles_source: "gps_estimate" }),
      s({ id: "g2", session_date: "2026-09-10", miles: 0.2, miles_source: "gps_estimate" }),
      s({ id: "v", session_date: "2026-09-08", miles: 9.4, miles_source: "gps_estimate", status: "voided" }),
    ]);
    expect(summary.claimMiles).toBe(71);
    expect(summary.gpsMiles).toBe(15.5);
    expect(summary.hiddenVoided).toBe(1);
    expect(summary.hiddenNoiseHops).toBe(1);
    expect(summary.days).toHaveLength(1);
    expect(summary.days[0].gpsHops.map((h) => h.id)).toEqual(["g1"]);
    expect(summary.days[0].untaggedClaim).toBe(true);
  });
});
