import { describe, expect, it } from "vitest";
import { jobPricingModeFromSources } from "../prefill-from-job";

describe("jobPricingModeFromSources", () => {
  it("defaults a job with no estimate and no booking to hourly (quick-book)", () => {
    expect(jobPricingModeFromSources(null, null)).toBe("hourly_internal");
  });

  it("uses the approved estimate mode when present", () => {
    expect(jobPricingModeFromSources("hourly_internal", null)).toBe("hourly_internal");
    expect(jobPricingModeFromSources("flat_rate", "hourly_internal")).toBe("flat_rate");
  });

  it("falls back to the booking request mode when there is no estimate", () => {
    expect(jobPricingModeFromSources(null, "hourly_internal")).toBe("hourly_internal");
    expect(jobPricingModeFromSources(null, "flat_rate")).toBe("flat_rate");
  });

  it("returns null for an unrecognized mode so callers do not guess", () => {
    expect(jobPricingModeFromSources("something_else", null)).toBeNull();
  });
});
