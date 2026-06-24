import { describe, it, expect } from "vitest";
import { buildWorkOrderDraft, buildAssessmentSummary } from "../index";

describe("buildWorkOrderDraft", () => {
  it("maps a summary into a work-order draft with tasks + conditions + traceability", () => {
    const summary = buildAssessmentSummary({
      visitId: "v1",
      assessmentId: "a1",
      rooms: [
        { id: "r1", name: "Kitchen", length_ft: 12, width_ft: 10, height_ft: 8, notes: "replace backsplash" },
        { id: "r2", name: "Hall", length_ft: null, width_ft: null, height_ft: null, notes: "" },
      ],
      scopeNotes: "Two-room refresh",
      hasPets: true,
      asbestosRisk: true,
    });
    const draft = buildWorkOrderDraft(summary);

    expect(draft.title).toBe("Work order — 2 areas");
    expect(draft.scopeDescription).toBe(summary.generatedJobDescription);
    expect(draft.rooms).toHaveLength(2);
    expect(draft.tasks).toEqual([
      { room: "Kitchen", description: "replace backsplash" },
      { room: "Hall", description: "Work in Hall" }, // falls back when no notes
    ]);
    expect(draft.siteConditions).toEqual(["pets on site", "asbestos risk"]);
    expect(draft.sourceVisitId).toBe("v1");
    expect(draft.sourceAssessmentId).toBe("a1");
  });

  it("handles an empty assessment", () => {
    const draft = buildWorkOrderDraft(buildAssessmentSummary({}));
    expect(draft.title).toBe("Work order");
    expect(draft.tasks).toEqual([]);
    expect(draft.siteConditions).toEqual([]);
    expect(draft.sourceVisitId).toBeNull();
  });
});
