import { describe, it, expect } from "vitest";
import { segmentConfidenceLevel } from "../segment-confidence";

describe("segmentConfidenceLevel", () => {
  it("rates drive with vehicle high", () => {
    expect(segmentConfidenceLevel({ kind: "drive", vehicle_id: "v1" })).toBe("high");
  });
  it("rates bare stop low", () => {
    expect(segmentConfidenceLevel({ kind: "stop" })).toBe("low");
  });
  it("rates rich stop high", () => {
    expect(
      segmentConfidenceLevel({
        kind: "stop",
        zone: "home",
        place_label: "Shop",
        latitude: 1,
        longitude: 2,
        ended_at: "2026-07-01T12:00:00Z",
      }),
    ).toBe("high");
  });
});
