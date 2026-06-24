import { describe, it, expect } from "vitest";
import { buildAssessmentSummary } from "@ai-fsm/domain";
import {
  buildMaterialsUserMessage,
  matchToSaved,
  type SavedMaterial,
} from "../materials-generator";

// These cover the pure, Claude-free parts of the materials generator:
// the user-message builder (assessment-aware vs fallback) and the price-book
// matcher. The Anthropic call itself is not exercised here.

describe("buildMaterialsUserMessage — assessment-driven", () => {
  const summary = buildAssessmentSummary({
    visitId: "v1",
    assessmentId: "a1",
    scopeNotes: "Kitchen refresh — patch and paint",
    rooms: [
      { id: "r1", name: "Kitchen", length_ft: 12, width_ft: 10, height_ft: 8, notes: "patch 3 drywall holes; replace 3 can lights" },
    ],
    totalSqft: 120,
    difficultAccess: true,
    leadPaintRisk: true,
    prepNotes: "mask cabinets, drop cloths",
    customerSuppliedMaterials: "customer supplies paint",
  });

  const msg = buildMaterialsUserMessage({
    scope: summary.generatedJobDescription,
    job_type: "painting",
    rooms: summary.rooms,
    assessmentSummary: summary,
  });

  it("flags the assessment as the source of truth", () => {
    expect(msg).toContain("## Site assessment (source of truth)");
  });

  it("includes room dimensions and the room note", () => {
    expect(msg).toContain("Kitchen: 12ft × 10ft");
    expect(msg).toContain("patch 3 drywall holes; replace 3 can lights");
  });

  it("carries site conditions, prep, and total area", () => {
    expect(msg).toContain("difficult access");
    expect(msg).toContain("lead paint risk");
    expect(msg).toContain("Prep requirements: mask cabinets, drop cloths");
    expect(msg).toContain("Total area: 120 sqft");
  });

  it("marks customer-supplied materials for exclusion", () => {
    expect(msg).toMatch(/Customer-supplied materials \(DO NOT include[^)]*\): customer supplies paint/);
    expect(msg).toContain("excluded_customer_supplied_items");
  });
});

describe("buildMaterialsUserMessage — fallback without an assessment", () => {
  it("builds from scope + room measurements only", () => {
    const msg = buildMaterialsUserMessage({
      scope: "Build a 12x16 deck",
      job_type: "carpentry",
      rooms: [{ id: "r1", name: "Deck", length_ft: 16, width_ft: 12, height_ft: null, notes: "" }],
    });
    expect(msg).toContain("Job type: carpentry");
    expect(msg).toContain("Scope: Build a 12x16 deck");
    expect(msg).toContain("Deck: 16ft × 12ft");
    expect(msg).not.toContain("## Site assessment");
  });

  it("omits the room block when there are no rooms", () => {
    const msg = buildMaterialsUserMessage({ scope: "Repair a fence section", job_type: "repair" });
    expect(msg).toContain("Scope: Repair a fence section");
    expect(msg).not.toContain("Room measurements");
  });
});

describe("matchToSaved — price book matching", () => {
  const saved: SavedMaterial[] = [
    { id: "s1", name: "Behr Premium Plus Interior Eggshell", brand: "Behr", category: "paint", unit: "gallon", unit_cost_cents: 4200, supplier: "Home Depot" },
    { id: "s2", name: "2x4x8 SPF Stud", brand: null, category: "lumber", unit: "board", unit_cost_cents: 550, supplier: null },
  ];

  it("matches on category + unit + overlapping name words", () => {
    const m = matchToSaved({ name: "Behr Premium Plus eggshell paint", category: "paint", unit: "gallon" }, saved);
    expect(m?.id).toBe("s1");
  });

  it("does not match across categories", () => {
    expect(matchToSaved({ name: "Behr Premium Plus", category: "lumber", unit: "gallon" }, saved)).toBeNull();
  });

  it("does not match when the unit differs", () => {
    expect(matchToSaved({ name: "2x4x8 SPF Stud", category: "lumber", unit: "each" }, saved)).toBeNull();
  });
});
