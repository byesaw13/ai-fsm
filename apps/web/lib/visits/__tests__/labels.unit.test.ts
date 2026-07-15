import { describe, expect, it } from "vitest";
import {
  isAssessmentVisit,
  isExecutionVisitType,
  isPreSaleVisit,
  visitTypeLabel,
} from "../labels";

describe("visitTypeLabel", () => {
  it("labels site_visit as Assessment and standard as Work Day", () => {
    expect(visitTypeLabel("site_visit")).toBe("Assessment");
    expect(visitTypeLabel("standard")).toBe("Work Day");
    expect(visitTypeLabel("punch_list")).toBe("Punch List");
    expect(visitTypeLabel("sales_walkthrough")).toBe("Sales Walkthrough");
  });

  it("falls back for unknown types", () => {
    expect(visitTypeLabel(null)).toBe("Visit");
    expect(visitTypeLabel("custom_thing")).toBe("custom thing");
  });
});

describe("visit kind helpers", () => {
  it("identifies assessment vs execution", () => {
    expect(isAssessmentVisit("site_visit")).toBe(true);
    expect(isAssessmentVisit("sales_walkthrough")).toBe(false);
    expect(isPreSaleVisit("sales_walkthrough")).toBe(true);
    expect(isExecutionVisitType("standard")).toBe(true);
    expect(isExecutionVisitType("site_visit")).toBe(false);
  });
});
