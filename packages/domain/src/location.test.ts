import { describe, it, expect } from "vitest";
import { classifyDrive, type DriveClassification } from "./location";

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
