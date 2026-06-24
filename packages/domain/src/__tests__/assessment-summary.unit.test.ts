import { describe, it, expect } from "vitest";
import {
  buildAssessmentSummary,
  buildAssessmentJobDescription,
  composeJobDescription,
  MAX_JOB_DESCRIPTION_LENGTH,
} from "../assessment-summary";

describe("buildAssessmentSummary", () => {
  it("normalizes fields and fills the generated description", () => {
    const summary = buildAssessmentSummary({
      visitId: "v1",
      assessmentId: "a1",
      rooms: [
        { id: "r1", name: "Living Room", length_ft: 12, width_ft: 10, height_ft: 8, notes: "south wall water stain" },
      ],
      scopeNotes: "Repaint two rooms",
      accessNotes: "lockbox",
      hasPets: true,
      totalSqft: 240,
    });
    expect(summary.visitId).toBe("v1");
    expect(summary.assessmentId).toBe("a1");
    expect(summary.rooms).toHaveLength(1);
    expect(summary.rooms[0]).toEqual({ id: "r1", name: "Living Room", length_ft: 12, width_ft: 10, height_ft: 8, notes: "south wall water stain" });
    expect(summary.hasPets).toBe(true);
    expect(summary.difficultAccess).toBe(false);
    expect(summary.totalSqft).toBe(240);
    // generated description reflects the same data
    expect(summary.generatedJobDescription).toContain("Repaint two rooms");
    expect(summary.generatedJobDescription).toContain("Living Room");
    expect(summary.generatedJobDescription).toContain("pets on site");
  });

  it("defaults missing fields and produces an empty description for an empty assessment", () => {
    const summary = buildAssessmentSummary({});
    expect(summary).toMatchObject({
      visitId: null,
      assessmentId: null,
      rooms: [],
      scopeNotes: null,
      accessNotes: null,
      hasPets: false,
      difficultAccess: false,
      asbestosRisk: false,
      leadPaintRisk: false,
      totalSqft: null,
      workItems: [],
      prepNotes: null,
      tradeNotes: {},
      customerSuppliedMaterials: null,
      generatedJobDescription: "",
    });
  });

  it("carries work items, prep, trade notes, and customer-supplied materials", () => {
    const summary = buildAssessmentSummary({
      scopeNotes: "Kitchen refresh",
      workItems: ["  patch 3 drywall holes  ", "", "paint ceiling"],
      prepNotes: "Mask cabinets",
      tradeNotes: { painting: "two coats, eggshell" },
      customerSuppliedMaterials: "customer supplies paint",
    });
    expect(summary.workItems).toEqual(["patch 3 drywall holes", "paint ceiling"]);
    expect(summary.prepNotes).toBe("Mask cabinets");
    expect(summary.tradeNotes.painting).toBe("two coats, eggshell");
    expect(summary.customerSuppliedMaterials).toBe("customer supplies paint");
    // The same fields flow into the generated description.
    expect(summary.generatedJobDescription).toContain("patch 3 drywall holes");
    expect(summary.generatedJobDescription).toContain("customer supplies paint");
  });

  it("coerces nullish room dimensions/notes to the canonical shape", () => {
    const summary = buildAssessmentSummary({
      rooms: [{ id: "r1", name: "Hall", length_ft: null, width_ft: null, height_ft: null, notes: "" }],
    });
    expect(summary.rooms[0]).toEqual({ id: "r1", name: "Hall", length_ft: null, width_ft: null, height_ft: null, notes: "" });
  });
});

describe("buildAssessmentJobDescription", () => {
  it("composes a full description from a multi-room assessment", () => {
    const out = buildAssessmentJobDescription({
      scope_notes: "Repaint first floor, patch drywall in hallway.",
      rooms: [
        { name: "Living Room", length_ft: 14, width_ft: 12, height_ft: 8, notes: "crown moulding" },
        { name: "Kitchen", length_ft: 10, width_ft: 10, height_ft: null, notes: "" },
      ],
      total_sqft: 268,
      has_pets: true,
      lead_paint_risk: true,
      access_notes: "Gate code 4421",
      photo_count: 3,
    });

    expect(out).toContain("Repaint first floor, patch drywall in hallway.");
    expect(out).toContain("Rooms / areas:");
    expect(out).toContain("- Living Room — 14 x 12 ft, 8 ft ceiling (168 sqft) — crown moulding");
    expect(out).toContain("- Kitchen — 10 x 10 ft (100 sqft)");
    expect(out).toContain("Total area: 268 sqft");
    expect(out).toContain("Site conditions: pets on site; lead paint risk");
    expect(out).toContain("Access: Gate code 4421");
    expect(out).toContain("3 assessment photos on file.");
  });

  it("handles rooms with notes only (no dimensions)", () => {
    const out = buildAssessmentJobDescription({
      rooms: [{ name: "Bathroom", notes: "water damage behind toilet" }],
    });
    expect(out).toBe("Rooms / areas:\n- Bathroom — water damage behind toilet");
  });

  it("skips empty rooms and missing room data without crashing", () => {
    const out = buildAssessmentJobDescription({
      scope_notes: "Replace exterior door.",
      rooms: [
        { name: "", length_ft: null, width_ft: null, height_ft: null, notes: "" },
        { name: "Entry", length_ft: 6, width_ft: null },
      ],
    });
    expect(out).toContain("Replace exterior door.");
    expect(out).toContain("- Entry");
    expect(out).not.toContain("- \n");
    expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });

  it("returns an empty string for an empty assessment", () => {
    expect(buildAssessmentJobDescription({})).toBe("");
    expect(buildAssessmentJobDescription({ rooms: [], scope_notes: "  " })).toBe("");
  });

  it("includes work items, prep, trade notes, and customer-supplied materials", () => {
    const out = buildAssessmentJobDescription({
      work_items: ["Paint ceiling", "Install baseboard"],
      prep_notes: "Move furniture, mask floors",
      trade_notes: {
        painting: "Two coats eggshell, color TBD",
        drywall: "Patch 2 holes in hallway",
        trim: "Replace 40 lf baseboard",
        flooring: "LVP in kitchen",
      },
      customer_supplied_materials: "Customer providing paint",
    });

    expect(out).toContain("Work items:\n- Paint ceiling\n- Install baseboard");
    expect(out).toContain("Prep requirements: Move furniture, mask floors");
    expect(out).toContain("Painting: Two coats eggshell, color TBD");
    expect(out).toContain("Drywall: Patch 2 holes in hallway");
    expect(out).toContain("Trim: Replace 40 lf baseboard");
    expect(out).toContain("Flooring: LVP in kitchen");
    expect(out).toContain("Customer-supplied materials: Customer providing paint");
  });
});

describe("composeJobDescription", () => {
  const assessment = {
    rooms: [{ name: "Office", length_ft: 10, width_ft: 12 }],
    has_pets: true,
  };

  it("combines a manual description with the assessment summary", () => {
    const out = composeJobDescription("Customer wants this done before July 4th.", assessment);
    expect(out.startsWith("Customer wants this done before July 4th.")).toBe(true);
    expect(out).toContain("- Office — 10 x 12 ft (120 sqft)");
    expect(out).toContain("Site conditions: pets on site");
  });

  it("returns just the summary when there is no manual description", () => {
    expect(composeJobDescription("", assessment)).toBe(
      buildAssessmentJobDescription(assessment)
    );
    expect(composeJobDescription(null, assessment)).toBe(
      buildAssessmentJobDescription(assessment)
    );
  });

  it("returns just the manual description when the assessment is empty", () => {
    expect(composeJobDescription("Fix the fence.", {})).toBe("Fix the fence.");
  });

  it("caps output at the materials API scope limit", () => {
    // Max-length scope notes plus extra sections must not exceed the cap.
    const longNotes = "x".repeat(MAX_JOB_DESCRIPTION_LENGTH);
    const out = buildAssessmentJobDescription({
      scope_notes: longNotes,
      rooms: [{ name: "Office", length_ft: 10, width_ft: 12 }],
      has_pets: true,
    });
    expect(out.length).toBeLessThanOrEqual(MAX_JOB_DESCRIPTION_LENGTH);
    expect(out.startsWith("xxx")).toBe(true);

    const shortCap = buildAssessmentJobDescription(
      {
        scope_notes: "Repaint bedroom.",
        rooms: [{ name: "Bedroom", length_ft: 10, width_ft: 12 }],
        has_pets: true,
      },
      { maxLength: 40 }
    );
    // Drops whole trailing sections rather than cutting mid-sentence.
    expect(shortCap).toBe("Repaint bedroom.");

    const composed = composeJobDescription(longNotes, {
      rooms: [{ name: "Office", length_ft: 10, width_ft: 12 }],
    });
    expect(composed.length).toBeLessThanOrEqual(MAX_JOB_DESCRIPTION_LENGTH);
  });

  it("does not duplicate when one side already contains the other", () => {
    const generated = buildAssessmentJobDescription(assessment);
    expect(composeJobDescription(generated, assessment)).toBe(generated);

    const manualWithSummary = `Job intro.\n\n${generated}`;
    expect(composeJobDescription(manualWithSummary, assessment)).toBe(manualWithSummary);
  });
});
