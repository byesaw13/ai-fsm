import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAVEL_SETTINGS,
  calculateTravelCharges,
  compareTravelSnapshots,
  determinePolicyTier,
  estimateDriveMinutesFromMiles,
  formatOriginAddress,
  resolveTripCount,
  roundMiles,
  roundTravelMinutes,
} from "./travel";

describe("travel policy tiers", () => {
  const s = DEFAULT_TRAVEL_SETTINGS;

  it("classifies local / extended / distant / long_distance", () => {
    expect(determinePolicyTier(10, s)).toBe("local");
    expect(determinePolicyTier(20, s)).toBe("local");
    expect(determinePolicyTier(20.1, s)).toBe("extended");
    expect(determinePolicyTier(35, s)).toBe("extended");
    expect(determinePolicyTier(35.1, s)).toBe("distant");
    expect(determinePolicyTier(60, s)).toBe("distant");
    expect(determinePolicyTier(60.1, s)).toBe("long_distance");
  });
});

describe("roundTravelMinutes", () => {
  it("supports exact, nearest 15, nearest 30", () => {
    expect(roundTravelMinutes(22, "exact")).toBe(22);
    expect(roundTravelMinutes(22, "nearest_15")).toBe(15);
    expect(roundTravelMinutes(23, "nearest_15")).toBe(30);
    expect(roundTravelMinutes(135, "nearest_15")).toBe(135);
    expect(roundTravelMinutes(40, "nearest_30")).toBe(30);
    expect(roundTravelMinutes(50, "nearest_30")).toBe(60);
  });
});

describe("Wells ME example (187 Webhannet Dr)", () => {
  /**
   * Business origin: 85 Rockingham Road, Derry, NH
   * Destination: ~62 mi one-way / ~124 mi RT / ~2h15m RT
   * $0.70/mi, $85/hr, nearest 15 min
   */
  const base = {
    one_way_miles: 62,
    one_way_minutes: 68, // ~2h15 RT → 135/2
    trip_count: 1,
    trip_direction: "round_trip" as const,
    settings: DEFAULT_TRAVEL_SETTINGS,
    mileage_rate_cents: 70,
    travel_time_rate_cents: 85_00,
  };

  it("computes billable miles, charges, and long-distance tier", () => {
    const r = calculateTravelCharges(base);

    expect(r.policy_tier).toBe("long_distance");
    expect(r.owner_review_required).toBe(true);
    expect(r.round_trip_miles).toBe(124);
    expect(r.included_miles).toBe(40);
    expect(r.billable_miles).toBe(84);
    expect(r.mileage_charge_cents).toBe(5880); // 84 * 70
    expect(r.billable_travel_minutes).toBe(135); // 68*2 rounded nearest 15
    // 135/60 * 8500 = 19125
    expect(r.travel_time_charge_cents).toBe(19125);
    expect(r.recommended_total_cents).toBe(5880 + 19125); // 25005 ≈ $250.05
    expect(r.total_travel_charge_cents).toBe(25005);
  });

  it("never produces negative billable miles", () => {
    const r = calculateTravelCharges({
      ...base,
      one_way_miles: 5,
      one_way_minutes: 10,
    });
    expect(r.billable_miles).toBe(0);
    expect(r.mileage_charge_cents).toBe(0);
    expect(r.policy_tier).toBe("local");
    expect(r.total_travel_charge_cents).toBe(0);
  });

  it("charges mileage only in extended band (no travel time)", () => {
    const r = calculateTravelCharges({
      ...base,
      one_way_miles: 28,
      one_way_minutes: 40,
    });
    expect(r.policy_tier).toBe("extended");
    expect(r.billable_miles).toBe(16); // 56 RT - 40 included
    expect(r.mileage_charge_cents).toBe(1120);
    expect(r.billable_travel_minutes).toBe(0);
    expect(r.travel_time_charge_cents).toBe(0);
  });

  it("charges mileage + travel time when distant (>35, ≤60)", () => {
    const r = calculateTravelCharges({
      ...base,
      one_way_miles: 45,
      one_way_minutes: 55,
    });
    expect(r.policy_tier).toBe("distant");
    expect(r.billable_miles).toBe(50); // 90 - 40
    expect(r.billable_travel_minutes).toBeGreaterThan(0);
    expect(r.travel_time_charge_cents).toBeGreaterThan(0);
  });
});

describe("client rules & charge modes", () => {
  const base = {
    one_way_miles: 45,
    one_way_minutes: 55,
    trip_count: 1,
    trip_direction: "round_trip" as const,
    settings: DEFAULT_TRAVEL_SETTINGS,
    mileage_rate_cents: 70,
    travel_time_rate_cents: 85_00,
  };

  it("does not auto-waive for realtor relationship alone", () => {
    const r = calculateTravelCharges({
      ...base,
      client: { relationship_type: "realtor", travel_rule: "standard_policy" },
    });
    expect(r.total_travel_charge_cents).toBeGreaterThan(0);
    expect(r.waived_all).toBe(false);
  });

  it("waives all travel when client rule says so", () => {
    const r = calculateTravelCharges({
      ...base,
      client: { travel_rule: "all_travel_waived" },
    });
    expect(r.waived_all).toBe(true);
    expect(r.total_travel_charge_cents).toBe(0);
    expect(r.mileage_charge_cents).toBe(0);
    expect(r.travel_time_charge_cents).toBe(0);
  });

  it("waives mileage only", () => {
    const r = calculateTravelCharges({
      ...base,
      client: { travel_rule: "mileage_waived" },
    });
    expect(r.waived_mileage).toBe(true);
    expect(r.mileage_charge_cents).toBe(0);
    expect(r.travel_time_charge_cents).toBeGreaterThan(0);
  });

  it("supports custom total override", () => {
    const r = calculateTravelCharges({
      ...base,
      charge_mode: "custom",
      custom_total_cents: 100_00,
    });
    expect(r.total_travel_charge_cents).toBe(10000);
    expect(r.recommended_total_cents).toBeGreaterThan(0);
  });

  it("applies custom included radius", () => {
    const r = calculateTravelCharges({
      ...base,
      one_way_miles: 30,
      one_way_minutes: 40,
      client: {
        travel_rule: "custom_included_radius",
        custom_included_one_way_miles: 30,
      },
    });
    expect(r.billable_miles).toBe(0);
  });
});

describe("multi-day trip counts", () => {
  it("resolves trip count from method", () => {
    expect(resolveTripCount({ method: "once_for_project" })).toBe(1);
    expect(
      resolveTripCount({ method: "once_per_visit", planned_visits: 3 })
    ).toBe(3);
    expect(
      resolveTripCount({ method: "once_per_workday", planned_workdays: 4 })
    ).toBe(4);
    expect(
      resolveTripCount({ method: "custom", custom_trip_count: 2 })
    ).toBe(2);
  });

  it("multiplies mileage across trips", () => {
    const single = calculateTravelCharges({
      one_way_miles: 28,
      one_way_minutes: 40,
      trip_count: 1,
      trip_direction: "round_trip",
      settings: DEFAULT_TRAVEL_SETTINGS,
      mileage_rate_cents: 70,
      travel_time_rate_cents: 85_00,
    });
    const multi = calculateTravelCharges({
      one_way_miles: 28,
      one_way_minutes: 40,
      trip_count: 3,
      trip_direction: "round_trip",
      settings: DEFAULT_TRAVEL_SETTINGS,
      mileage_rate_cents: 70,
      travel_time_rate_cents: 85_00,
    });
    // per trip billable 16 mi × 3 = 48 (included also scales)
    expect(multi.billable_miles).toBe(single.billable_miles * 3);
    expect(multi.mileage_charge_cents).toBe(single.mileage_charge_cents * 3);
  });
});

describe("invoice estimate vs actual", () => {
  it("flags owner review when actual exceeds estimate", () => {
    const d = compareTravelSnapshots({
      estimated_total_cents: 10000,
      actual_total_cents: 15000,
    });
    expect(d.actual_exceeds_estimate).toBe(true);
    expect(d.requires_owner_review).toBe(true);
    expect(d.difference_cents).toBe(5000);
  });

  it("does not require review when actual is lower", () => {
    const d = compareTravelSnapshots({
      estimated_total_cents: 10000,
      actual_total_cents: 8000,
    });
    expect(d.requires_owner_review).toBe(false);
  });
});

describe("helpers", () => {
  it("formats origin address", () => {
    expect(formatOriginAddress(DEFAULT_TRAVEL_SETTINGS)).toBe(
      "85 Rockingham Road, Derry, NH, 03038"
    );
  });

  it("roundMiles to 0.1", () => {
    expect(roundMiles(62.04)).toBe(62);
    expect(roundMiles(62.06)).toBe(62.1);
  });

  it("estimates drive minutes from miles", () => {
    expect(estimateDriveMinutesFromMiles(35)).toBe(60);
  });
});
