import { describe, it, expect } from "vitest";
import { buildWorkOrderDraft, materialItemsToDraft, buildAssessmentSummary } from "../index";

describe("buildWorkOrderDraft", () => {
  it("maps a summary into an editable draft (scope, site/safety, rooms, traceability)", () => {
    const summary = buildAssessmentSummary({
      visitId: "v1",
      assessmentId: "a1",
      rooms: [
        { id: "r1", name: "Kitchen", length_ft: 12, width_ft: 10, height_ft: 8, notes: "replace backsplash" },
        { id: "r2", name: "Hall", length_ft: null, width_ft: null, height_ft: null, notes: "" },
      ],
      scopeNotes: "Two-room refresh",
      accessNotes: "side door, lockbox 1234",
      hasPets: true,
      asbestosRisk: true,
    });
    const draft = buildWorkOrderDraft(summary);

    expect(draft.title).toBe("Work order — 2 areas");
    expect(draft.scope).toBe(summary.generatedJobDescription);
    expect(draft.roomBreakdown).toEqual([
      { name: "Kitchen", dimensions: "12 x 10 ft, 8 ft ceiling", description: "replace backsplash" },
      { name: "Hall", dimensions: null, description: "Work in Hall" },
    ]);
    expect(draft.siteNotes).toContain("side door, lockbox 1234");
    expect(draft.siteNotes).toContain("Pets on site.");
    expect(draft.safetyNotes).toContain("Asbestos risk");
    expect(draft.materials).toEqual([]); // seeded on demand, not auto
    expect(draft.sourceVisitId).toBe("v1");
    expect(draft.sourceAssessmentId).toBe("a1");
  });

  it("handles an empty assessment", () => {
    const draft = buildWorkOrderDraft(buildAssessmentSummary({}));
    expect(draft.title).toBe("Work order");
    expect(draft.roomBreakdown).toEqual([]);
    expect(draft.siteNotes).toBe("");
    expect(draft.safetyNotes).toBe("");
    expect(draft.sourceVisitId).toBeNull();
  });
});

describe("materialItemsToDraft", () => {
  it("maps AI material suggestions into confirmable draft rows", () => {
    const rows = materialItemsToDraft([
      { name: "Drywall sheet", brand: "USG", quantity: 6, unit: "sheets", unit_cost_cents: 1200, total_cost_cents: 7200 },
      { name: "Joint compound", quantity: 2, unit_cost_cents: 1500, total_cost_cents: 3000 },
    ]);
    expect(rows[0]).toEqual({ description: "Drywall sheet (USG) — 6 sheets", quantity: 6, unitCents: 1200, totalCents: 7200, suggested: true });
    expect(rows[1].description).toBe("Joint compound");
    expect(rows[1].suggested).toBe(true);
  });
});
