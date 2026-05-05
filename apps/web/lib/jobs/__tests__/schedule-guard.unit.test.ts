import { describe, expect, it } from "vitest";
import { reviewScheduleDay } from "../schedule-guard";

// 2026-01-07 is a Wednesday; 2026-01-06 is a Tuesday
const WEDNESDAY = "2026-01-07";
const TUESDAY = "2026-01-06";

describe("reviewScheduleDay", () => {
  it("warns when a project job is scheduled on Wednesday", () => {
    const result = reviewScheduleDay(WEDNESDAY, "high_margin_project");
    expect(result.warning).toMatch(/wednesday.*maintenance/i);
  });

  it("does not warn when a membership job is scheduled on Wednesday", () => {
    const result = reviewScheduleDay(WEDNESDAY, "membership");
    expect(result.warning).toBeNull();
  });

  it("does not warn when a project job is scheduled on a non-Wednesday", () => {
    const result = reviewScheduleDay(TUESDAY, "high_margin_project");
    expect(result.warning).toBeNull();
  });

  it("does not warn when job category is null", () => {
    const result = reviewScheduleDay(WEDNESDAY, null);
    expect(result.warning).toBeNull();
  });

  it("does not warn when date is null", () => {
    const result = reviewScheduleDay(null, "reactive_low_quality");
    expect(result.warning).toBeNull();
  });

  it("does not warn for realtor_baseline on Wednesday", () => {
    const result = reviewScheduleDay(WEDNESDAY, "realtor_baseline");
    expect(result.warning).toBeNull();
  });

  it("warns for reactive_low_quality on Wednesday", () => {
    const result = reviewScheduleDay(WEDNESDAY, "reactive_low_quality");
    expect(result.warning).not.toBeNull();
  });
});
