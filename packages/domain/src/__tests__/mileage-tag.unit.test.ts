import { describe, expect, it } from "vitest";
import { mileageTagStrategy } from "../mileage-tag";

describe("mileageTagStrategy", () => {
  it("tags the odometer day when this is the only job", () => {
    expect(
      mileageTagStrategy({
        otherCompletedVisitsThatDay: 0,
        hasUntaggedClaim: true,
        hasUntaggedGpsHops: true,
      }),
    ).toBe("claim_day");
  });

  it("tags GPS hops when another job already finished that day", () => {
    expect(
      mileageTagStrategy({
        otherCompletedVisitsThatDay: 1,
        hasUntaggedClaim: true,
        hasUntaggedGpsHops: true,
      }),
    ).toBe("gps_hops");
  });
});
