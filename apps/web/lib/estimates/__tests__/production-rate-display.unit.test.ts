import { describe, it, expect } from "vitest";
import { modifierLabel, rateConversionLabel } from "../production-rate-display";

describe("rateConversionLabel (TASK-193)", () => {
  it("shows a per-day rate with its hourly pace at the hours-per-day setting", () => {
    expect(rateConversionLabel({ base_rate: 400, rate_unit: "sqft_per_day" }, 8)).toBe("400 sq ft a day = 50 sq ft an hour at 8 h a day");
    expect(rateConversionLabel({ base_rate: 400, rate_unit: "sqft_per_day" }, 10)).toBe("400 sq ft a day = 40 sq ft an hour at 10 h a day");
    expect(rateConversionLabel({ base_rate: 150, rate_unit: "linear_ft_per_day" }, 8)).toBe("150 linear ft a day = 18.8 linear ft an hour at 8 h a day");
  });

  it("shows a per-hour rate as is", () => {
    expect(rateConversionLabel({ base_rate: 50, rate_unit: "sqft_per_hour" }, 8)).toBe("50 sq ft an hour");
  });
});

describe("modifierLabel", () => {
  it("says whether a modifier slows or speeds the work", () => {
    expect(modifierLabel(-0.15)).toBe("-15% (slower)");
    expect(modifierLabel(0.1)).toBe("+10% (faster)");
    expect(modifierLabel(0)).toBe("0%");
  });
});
