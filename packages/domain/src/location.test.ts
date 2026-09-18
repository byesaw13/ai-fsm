import { describe, it, expect } from "vitest";
import {
  classifyDrive,
  classifyStop,
  MIN_STOP_SECONDS,
  DEFAULT_RELOCATION_METERS,
  MIN_RELOCATION_METERS,
  relocationRadiusMeters,
  isOutsideStopFence,
  shouldLearnHomeCoords,
  type DriveClassification,
} from "./location";

const min = (m: number) => m * 60;

describe("classifyDrive", () => {
  // Cases drawn from real captured drives (2026-06-20..22).
  const cases: Array<[string, { distanceMeters: number | null; durationSeconds: number }, DriveClassification]> = [
    // Real trips — kept.
    ["15 km in 22 min (~41 km/h)", { distanceMeters: 15128, durationSeconds: min(22) }, "ok"],
    ["25 km in 38 min (~39 km/h)", { distanceMeters: 25005, durationSeconds: min(38) }, "ok"],
    ["1985 m in 29.6 min (~4 km/h)", { distanceMeters: 1985, durationSeconds: min(29.6) }, "ok"],
    // Distance unknown → can't judge, keep (real 06-19 trip had no GPS points).
    ["unknown distance, 7 min", { distanceMeters: null, durationSeconds: min(7) }, "ok"],
    // Borderline — flagged.
    ["300 m in 10 min (~1.8 km/h)", { distanceMeters: 300, durationSeconds: min(10) }, "suspect"],
    // Noise — auto-dismissed.
    ["244 m in 31 min (~0.5 km/h, drift)", { distanceMeters: 244, durationSeconds: min(31) }, "noise"],
    ["17 m in 7.3 min (parked BT)", { distanceMeters: 17, durationSeconds: min(7.3) }, "noise"],
    ["2 m in 6.8 min (parked BT)", { distanceMeters: 2, durationSeconds: min(6.8) }, "noise"],
    ["0 m in 24 s (blip)", { distanceMeters: 0, durationSeconds: 24 }, "noise"],
    ["sub-minute teleport 7843 m in 0 s", { distanceMeters: 7843, durationSeconds: 0 }, "noise"],
  ];

  it.each(cases)("%s → %s", (_label, input, expected) => {
    expect(classifyDrive(input)).toBe(expected);
  });

  it("treats the 1 km/h boundary as noise and 3 km/h as ok", () => {
    // exactly 1 km/h over an hour → not below NOISE_MAX, so suspect not noise
    expect(classifyDrive({ distanceMeters: 1000, durationSeconds: 3600 })).toBe("suspect");
    // exactly 3 km/h → not below SUSPECT_MAX → ok
    expect(classifyDrive({ distanceMeters: 3000, durationSeconds: 3600 })).toBe("ok");
    // just under 1 km/h → noise
    expect(classifyDrive({ distanceMeters: 990, durationSeconds: 3600 })).toBe("noise");
  });
});

describe("classifyStop", () => {
  // Cases drawn from real captured stops (2026-08-10..14).
  const cases: Array<[string, { durationSeconds: number; hasScheduledVisit?: boolean }, "ok" | "noise"]> = [
    // HA still / zone flicker — auto-dismissed.
    ["0.1 min address flicker", { durationSeconds: 6 }, "noise"],
    ["0.3 min Nashua Rd", { durationSeconds: 18 }, "noise"],
    ["1.0 min same address", { durationSeconds: 60 }, "noise"],
    ["1.7 min traffic-light still", { durationSeconds: min(1.7) }, "noise"],
    ["3.5 min Home Depot blip", { durationSeconds: min(3.5) }, "noise"],
    ["4.0 min Lowe's blip", { durationSeconds: min(4.0) }, "noise"],
    ["just under 5 min", { durationSeconds: MIN_STOP_SECONDS - 1 }, "noise"],
    // Reportable stays — kept.
    ["exactly 5 min", { durationSeconds: MIN_STOP_SECONDS }, "ok"],
    ["8.3 min Transfer station", { durationSeconds: min(8.3) }, "ok"],
    ["25.8 min shop stop", { durationSeconds: min(25.8) }, "ok"],
    // Scheduled visit today — even a brief arrival counts.
    ["0 min at a scheduled visit", { durationSeconds: 0, hasScheduledVisit: true }, "ok"],
    ["2 min at a scheduled visit", { durationSeconds: min(2), hasScheduledVisit: true }, "ok"],
  ];

  it.each(cases)("%s → %s", (_label, input, expected) => {
    expect(classifyStop(input)).toBe(expected);
  });
});

describe("relocationRadiusMeters (TASK-148)", () => {
  it("uses 250ft when the stop is unmatched", () => {
    expect(relocationRadiusMeters(null)).toBeCloseTo(DEFAULT_RELOCATION_METERS);
    expect(relocationRadiusMeters(undefined)).toBeCloseTo(DEFAULT_RELOCATION_METERS);
  });

  it("floors a 150ft geofence at 80m so jitter cannot split", () => {
    expect(relocationRadiusMeters(150)).toBe(MIN_RELOCATION_METERS);
  });

  it("uses a wide rural geofence as-is", () => {
    expect(relocationRadiusMeters(400)).toBeCloseTo(400 * 0.3048);
  });
});

describe("isOutsideStopFence (TASK-148)", () => {
  const ash = { latitude: 43.201, longitude: -71.501 };
  it("stays inside for a walk around the house (~22m)", () => {
    expect(
      isOutsideStopFence({
        from: ash,
        to: { latitude: ash.latitude + 0.0002, longitude: ash.longitude },
        radiusMeters: MIN_RELOCATION_METERS,
      }),
    ).toBe(false);
  });
  it("splits a walk next door (~111m)", () => {
    expect(
      isOutsideStopFence({
        from: ash,
        to: { latitude: ash.latitude + 0.001, longitude: ash.longitude },
        radiusMeters: MIN_RELOCATION_METERS,
      }),
    ).toBe(true);
  });
});

describe("shouldLearnHomeCoords (TASK-148)", () => {
  it("learns the first home-zone fix", () => {
    expect(
      shouldLearnHomeCoords({
        zone: "home",
        latitude: 43.2,
        longitude: -71.5,
        stored: null,
      }),
    ).toEqual({ learn: true, reason: "missing" });
  });
  it("ignores non-home zones", () => {
    expect(
      shouldLearnHomeCoords({
        zone: "4 Ash",
        latitude: 43.2,
        longitude: -71.5,
        stored: null,
      }).learn,
    ).toBe(false);
  });
  it("relearns when the home pin moved >500m", () => {
    expect(
      shouldLearnHomeCoords({
        zone: "Home",
        latitude: 43.21,
        longitude: -71.5,
        stored: { latitude: 43.2, longitude: -71.5 },
      }),
    ).toMatchObject({ learn: true, reason: "moved" });
  });
});
