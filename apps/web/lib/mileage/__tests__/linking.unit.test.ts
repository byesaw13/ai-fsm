import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { inferTripMilesSource, voidEnclosedGpsEstimates } from "../linking";

describe("inferTripMilesSource", () => {
  it("uses bt_gps_estimate when miles match GPS pre-fill on a BT-tagged drive", () => {
    expect(
      inferTripMilesSource({ segmentVehicleId: "veh-1", estimatedMiles: 12.4, submittedMiles: 12.4 }),
    ).toBe("bt_gps_estimate");
  });

  it("uses gps_estimate without a segment vehicle tag", () => {
    expect(
      inferTripMilesSource({ segmentVehicleId: null, estimatedMiles: 8.0, submittedMiles: 8.1 }),
    ).toBe("gps_estimate");
  });

  it("uses manual_miles when the owner edits away from the estimate", () => {
    expect(
      inferTripMilesSource({ segmentVehicleId: null, estimatedMiles: 8.0, submittedMiles: 15 }),
    ).toBe("manual_miles");
  });
});

describe("voidEnclosedGpsEstimates", () => {
  const interval = {
    startedAt: "2026-07-06T08:00:00.000Z",
    endedAt: "2026-07-06T17:00:00.000Z",
  };

  it("voids GPS trips enclosed by the odometer session interval", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { id: "gps-1", miles: 12, start_odometer: null, end_odometer: null, miles_source: "gps_estimate" },
          { id: "gps-2", miles: 5, start_odometer: null, end_odometer: null, miles_source: "bt_gps_estimate" },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;

    const result = await voidEnclosedGpsEstimates(
      client,
      "acct",
      "2026-07-06",
      "odo-1",
      "veh-1",
      interval,
    );

    expect(result.voidedIds).toEqual(["gps-1", "gps-2"]);
    expect(result.voidedMiles).toBe(17);
    expect(query.mock.calls[0][1]).toEqual([
      "acct",
      "2026-07-06",
      "odo-1",
      "veh-1",
      interval.startedAt,
      interval.endedAt,
    ]);
    expect(query).toHaveBeenCalledTimes(3);
  });
});