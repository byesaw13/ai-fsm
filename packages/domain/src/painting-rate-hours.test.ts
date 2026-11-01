import { describe, it, expect } from "vitest";
import { paintingRateHours, type PaintingRate } from "./painting-rate-hours";
import type { ProjectOptions, RoomSpec } from "./painting";

// 12 x 10 room, 8 ft: perimeter 44, gross 352, minus 1 door (20) and 2 windows (30) = 302 sq ft.
const ROOM: RoomSpec = {
  name: "Bedroom", length_ft: 12, width_ft: 10, ceiling_height_ft: 8, doors: 1, windows: 2,
  include_ceiling: false, include_trim: false, prep_level: "minor", paint_supplied_by: "dovetails",
  paint_grade: "standard", primer_needed: false, dark_to_light: false,
};
const OPTIONS: ProjectOptions = { coat_count: 2, occupied_home: false, vaulted_ceilings: false };

function rates(overrides: { wallCalibrated?: boolean; trimCalibrated?: boolean; modsCalibrated?: boolean } = {}): PaintingRate[] {
  return [
    {
      id: "r-wall", service_code: "5012", scope_component_key: "wall_sqft", base_rate: 400,
      rate_unit: "sqft_per_day", calibrated: overrides.wallCalibrated ?? false,
      modifiers: [
        { id: "m-dark", complexity_factor_key: "dark_to_light", modifier_pct: -0.2, calibrated: overrides.modsCalibrated ?? false },
        { id: "m-occ", complexity_factor_key: "occupied_home", modifier_pct: -0.1, calibrated: overrides.modsCalibrated ?? false },
      ],
    },
    {
      id: "r-trim", service_code: "5003", scope_component_key: "trim_linear_ft", base_rate: 120,
      rate_unit: "linear_ft_per_day", calibrated: overrides.trimCalibrated ?? false, modifiers: [],
    },
  ];
}

describe("paintingRateHours", () => {
  it("drives walls from rate 5012 even when uncalibrated", () => {
    const r = paintingRateHours([ROOM], OPTIONS, rates(), 8);
    // 302 / 400 x 8 = 6.04
    expect(r.hours).toBe(6);
    expect(r.usesProductionRate).toBe(true);
    expect(r.calibrated).toBe(false);
    expect(r.snapshot.parts).toHaveLength(1);
    expect(r.snapshot.parts[0]).toMatchObject({ surface: "walls", rate_id: "r-wall", base_rate: 400, quantity: 302, hours: 6.04, calibrated: false });
  });

  it("uses the hours-per-day setting", () => {
    expect(paintingRateHours([ROOM], OPTIONS, rates(), 10).hours).toBe(7.6); // 302 / 400 x 10 = 7.55
  });

  it("keeps ceilings on the default pace", () => {
    const r = paintingRateHours([{ ...ROOM, include_ceiling: true }], OPTIONS, rates(), 8);
    // walls 6.04 + ceiling 120 / 100 x 0.85 x 2 = 2.04
    expect(r.hours).toBe(8.1);
    expect(r.snapshot.default_surfaces).toEqual(["ceiling"]);
    expect(r.snapshot.default_hours).toBe(2.04);
  });

  it("slows walls by matching modifiers and records them", () => {
    const r = paintingRateHours([{ ...ROOM, dark_to_light: true }], { ...OPTIONS, occupied_home: true }, rates(), 8);
    // 6.04 / (1 - 0.3)
    expect(r.snapshot.parts[0].hours).toBeCloseTo(8.63, 2);
    expect(r.snapshot.parts[0].modifiers.map((m) => m.key).sort()).toEqual(["dark_to_light", "occupied_home"]);
  });

  it("applies the Craftsman height factor and the coat count", () => {
    const tall = paintingRateHours([{ ...ROOM, ceiling_height_ft: 10 }], { ...OPTIONS, coat_count: 3 }, rates(), 8);
    // 10 ft: perimeter 44 x 10 = 440 - 50 = 390; x 1.23 x 1.5 / 400 x 8
    expect(tall.snapshot.parts[0].hours).toBeCloseTo((390 * 1.23 * 1.5 / 400) * 8, 2);
  });

  it("leaves trim off while its rate is uncalibrated", () => {
    const r = paintingRateHours([{ ...ROOM, include_trim: true }], OPTIONS, rates(), 8);
    expect(r.snapshot.parts.map((p) => p.surface)).toEqual(["walls"]);
  });

  it("adds trim from rate 5003 once calibrated", () => {
    const r = paintingRateHours([{ ...ROOM, include_trim: true }], OPTIONS, rates({ trimCalibrated: true }), 8);
    // trim 44 - 3 = 41 LF / 120 x 8 = 2.73
    expect(r.snapshot.parts.find((p) => p.surface === "trim")?.hours).toBe(2.73);
    expect(r.hours).toBe(8.8);
  });

  it("is calibrated only when every part is and nothing used the default", () => {
    const all = rates({ wallCalibrated: true, trimCalibrated: true, modsCalibrated: true });
    expect(paintingRateHours([ROOM], OPTIONS, all, 8).calibrated).toBe(true);
    expect(paintingRateHours([{ ...ROOM, dark_to_light: true }], OPTIONS, rates({ wallCalibrated: true }), 8).calibrated).toBe(false);
    expect(paintingRateHours([{ ...ROOM, include_ceiling: true }], OPTIONS, all, 8).calibrated).toBe(false);
  });

  it("falls back to the default pace when rate 5012 is missing", () => {
    const r = paintingRateHours([ROOM], OPTIONS, [], 8);
    // 302 / 100 x 0.85 x 2 = 5.134
    expect(r.hours).toBe(5.1);
    expect(r.usesProductionRate).toBe(false);
    expect(r.snapshot.parts).toEqual([]);
  });

  it("skips rooms without dimensions", () => {
    expect(paintingRateHours([{ ...ROOM, length_ft: 0 }], OPTIONS, rates(), 8).hours).toBe(0);
  });
});
