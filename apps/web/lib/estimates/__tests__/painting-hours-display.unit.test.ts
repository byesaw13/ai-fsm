import { describe, it, expect } from "vitest";
import { paintingRateHours, type PaintingRate, type RoomSpec } from "@ai-fsm/domain";
import { paintingHoursBasis } from "../painting-hours-display";

const ROOM: RoomSpec = {
  name: "Bedroom", length_ft: 12, width_ft: 10, ceiling_height_ft: 8, doors: 1, windows: 2,
  include_ceiling: true, include_trim: false, prep_level: "minor", paint_supplied_by: "dovetails",
  paint_grade: "standard", primer_needed: false, dark_to_light: true,
};
const WALL = (calibrated: boolean): PaintingRate => ({
  id: "r", service_code: "5012", scope_component_key: "wall_sqft", base_rate: 400, rate_unit: "sqft_per_day", calibrated,
  modifiers: [{ id: "m", complexity_factor_key: "dark_to_light", modifier_pct: -0.2, calibrated }],
});
const OPTIONS = { coat_count: 2, occupied_home: false, vaulted_ceilings: false };

describe("paintingHoursBasis", () => {
  it("names the uncalibrated wall rate, its modifiers and the estimated ceilings", () => {
    expect(paintingHoursBasis(paintingRateHours([ROOM], OPTIONS, [WALL(false)], 8))).toBe(
      "walls from production rate (uncalibrated), 400 sq ft a day = 50 sq ft an hour at 8 h a day, slowed for dark to light; " +
        "ceilings estimated at 0.85 h per 100 sq ft a coat (no calibrated rate)",
    );
  });

  it("drops the uncalibrated mark once the rate and modifiers are calibrated", () => {
    const text = paintingHoursBasis(paintingRateHours([{ ...ROOM, include_ceiling: false }], OPTIONS, [WALL(true)], 8));
    expect(text).toBe("walls from production rate, 400 sq ft a day = 50 sq ft an hour at 8 h a day, slowed for dark to light");
  });
});
