import { describe, it, expect } from "vitest";
import { pickStartVehicle, canSmartStart, type StartDayVehicle } from "../start-day";

const v = (id: string, last_used_at: string | null, current_odometer: number | null = 1000): StartDayVehicle => ({
  id, nickname: id, plate: null, current_odometer, last_used_at,
});

describe("pickStartVehicle", () => {
  it("returns null when there are no vehicles", () => {
    expect(pickStartVehicle([])).toBeNull();
  });

  it("picks the most recently used vehicle", () => {
    const out = pickStartVehicle([
      v("ram", "2026-06-10T08:00:00Z"),
      v("van", "2026-06-15T07:30:00Z"), // most recent
      v("car", "2026-06-12T09:00:00Z"),
    ]);
    expect(out?.id).toBe("van");
  });

  it("falls back to the first vehicle when none have been used", () => {
    const out = pickStartVehicle([v("ram", null), v("van", null)]);
    expect(out?.id).toBe("ram");
  });

  it("ignores unusable timestamps", () => {
    const out = pickStartVehicle([v("ram", "not-a-date"), v("van", "2026-06-01T00:00:00Z")]);
    expect(out?.id).toBe("van");
  });
});

describe("canSmartStart", () => {
  it("is true only when a last odometer is known", () => {
    expect(canSmartStart(v("ram", "2026-06-10T08:00:00Z", 12450))).toBe(true);
    expect(canSmartStart(v("ram", "2026-06-10T08:00:00Z", null))).toBe(false);
    expect(canSmartStart(null)).toBe(false);
  });
});
