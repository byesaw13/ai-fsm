import { describe, it, expect } from "vitest";
import { haversineMeters, pathDistanceMeters, metersToMiles, metersToMilesRounded } from "../geo";

describe("geo distance", () => {
  it("haversine is ~0 for the same point", () => {
    expect(haversineMeters({ latitude: 42.1, longitude: -71.2 }, { latitude: 42.1, longitude: -71.2 })).toBeLessThan(1);
  });

  it("one degree of latitude is ~111 km", () => {
    const m = haversineMeters({ latitude: 42, longitude: -71 }, { latitude: 43, longitude: -71 });
    expect(m).toBeGreaterThan(110_000);
    expect(m).toBeLessThan(112_000);
  });

  it("a known short hop is in range (~1.5 km)", () => {
    // ~0.0135 deg lat ≈ 1.5 km
    const m = haversineMeters({ latitude: 42.0, longitude: -71.0 }, { latitude: 42.0135, longitude: -71.0 });
    expect(m).toBeGreaterThan(1400);
    expect(m).toBeLessThan(1600);
  });

  it("path distance sums the legs", () => {
    const pts = [
      { latitude: 42.0, longitude: -71.0 },
      { latitude: 42.0135, longitude: -71.0 },
      { latitude: 42.027, longitude: -71.0 },
    ];
    const total = pathDistanceMeters(pts);
    const leg = haversineMeters(pts[0], pts[1]);
    expect(total).toBeGreaterThan(leg * 1.9);
    expect(total).toBeLessThan(leg * 2.1);
  });

  it("meters → miles conversions", () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 5);
    expect(metersToMilesRounded(8046.72)).toBe(5);
  });
});
