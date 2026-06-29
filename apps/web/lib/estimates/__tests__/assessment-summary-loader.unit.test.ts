import { describe, it, expect } from "vitest";
import {
  mapRowToAssessmentSummary,
  type SiteVisitAssessmentRow,
} from "../assessment-summary-loader";

const baseRow: SiteVisitAssessmentRow = {
  id: "a1",
  visit_id: "v1",
  rooms: [
    { id: "r1", name: "Kitchen", length_ft: 12, width_ft: 10, height_ft: 8, notes: "tile backsplash" },
  ],
  scope_notes: "Cabinets + backsplash",
  access_notes: "side door",
  has_pets: false,
  difficult_access: true,
  asbestos_risk: false,
  lead_paint_risk: true,
  total_sqft: "240.00", // numeric comes back as string from pg
  photo_count: "3",
};

describe("mapRowToAssessmentSummary", () => {
  it("maps a persisted row into the canonical summary", () => {
    const s = mapRowToAssessmentSummary(baseRow);
    expect(s.visitId).toBe("v1");
    expect(s.assessmentId).toBe("a1");
    expect(s.rooms).toEqual([
      { id: "r1", name: "Kitchen", length_ft: 12, width_ft: 10, height_ft: 8, notes: "tile backsplash" },
    ]);
    expect(s.scopeNotes).toBe("Cabinets + backsplash");
    expect(s.difficultAccess).toBe(true);
    expect(s.leadPaintRisk).toBe(true);
    expect(s.totalSqft).toBe(240); // numeric string coerced
    expect(s.generatedJobDescription).toContain("Cabinets + backsplash");
    expect(s.generatedJobDescription).toContain("3 assessment photos");
  });

  it("tolerates non-array / malformed rooms and null numerics", () => {
    const s = mapRowToAssessmentSummary({
      ...baseRow,
      rooms: null,
      total_sqft: null,
      photo_count: null,
    });
    expect(s.rooms).toEqual([]);
    expect(s.totalSqft).toBeNull();
  });

  it("coerces string room dimensions and missing fields", () => {
    const s = mapRowToAssessmentSummary({
      ...baseRow,
      rooms: [{ id: "r2", name: "Bath", length_ft: "5", width_ft: "8" }],
    });
    expect(s.rooms[0]).toEqual({ id: "r2", name: "Bath", length_ft: 5, width_ft: 8, height_ft: null, notes: "" });
  });
});
