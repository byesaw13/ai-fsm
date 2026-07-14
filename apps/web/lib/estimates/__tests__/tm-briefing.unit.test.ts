import { describe, it, expect } from "vitest";
import {
  midHours,
  resolveLaborRateCents,
  finalizeTmDraft,
  materialsEstimateCents,
  buildTmCustomerNotes,
  buildTmInternalNotes,
  type TmBriefingExtraction,
} from "../tm-briefing";
import {
  LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  MA_LABOR_RATE_DELTA,
  DEFAULT_PRICING_SETTINGS,
} from "@ai-fsm/domain";

function sampleExtraction(overrides: Partial<TmBriefingExtraction> = {}): TmBriefingExtraction {
  return {
    recommended_mode: "time_and_materials",
    mode_rationale: "Punch-list with unknowns and HO paint risk",
    location_city: "Maynard",
    location_state: "MA",
    location_notes: null,
    scope_summary: "Patch/paint, molding, trim and cabinet paint",
    scope_items: [
      "Ceiling crown molding",
      "Floor/base molding",
      "Trim and cabinet painting",
      "Patch and paint areas",
    ],
    labor_hours_min: 16,
    labor_hours_max: 18,
    travel_hours_min: 3,
    travel_hours_max: 4,
    working_days: 2,
    trip_count: "multi_trip",
    materials: [
      {
        name: "Benjamin Moore Advance Satin (trim)",
        quantity: 1,
        unit_label: "quart",
        unit_cost_cents: 2800,
        customer_supplied: false,
        notes: null,
        store_section: "Paint & Supplies",
      },
      {
        name: "Existing wall/ceiling paint",
        quantity: null,
        unit_label: "gallon",
        unit_cost_cents: null,
        customer_supplied: true,
        notes: "Age unknown — verify before use",
        store_section: "Paint & Supplies",
      },
    ],
    materials_policy:
      "Customer has provided existing paint. If aged or mismatched, buy more after approval.",
    risks: ["HO paint condition", "Patch sizes may grow"],
    customer_notes: "T&M is appropriate given unknowns.",
    internal_notes: "Carry extra mud and primer.",
    proposal_summary: "Two-day punch-list painting and molding in Maynard.",
    confidence: "medium",
    confidence_notes: "Hours from owner judgment; no room dimensions.",
    schedule_notes: "Day 1 prep/patch/molding; Day 2 paint and finish.",
    difficult_access: false,
    old_house_risk: false,
    requires_drying_or_curing: true,
    coordination_required: false,
    finish_expectation: "clean",
    pasted_rate_cents: 8500,
    ...overrides,
  };
}

describe("tm-briefing pure helpers", () => {
  it("midHours averages and snaps to quarter hours", () => {
    expect(midHours(16, 18)).toBe(17);
    expect(midHours(3, 4)).toBe(3.5);
    expect(midHours(5, 5)).toBe(5);
  });

  it("applies MA labor premium from pricing settings", () => {
    const nh = resolveLaborRateCents("NH");
    const ma = resolveLaborRateCents("MA");
    expect(nh.is_ma).toBe(false);
    expect(nh.labor_rate_cents).toBe(LABOR_CUSTOMER_RATE_CENTS_PER_HOUR);
    expect(nh.cost_rate_cents).toBe(DEFAULT_PRICING_SETTINGS.labor_cost_cents_per_hour);
    expect(ma.is_ma).toBe(true);
    expect(ma.labor_rate_cents).toBe(
      Math.round(LABOR_CUSTOMER_RATE_CENTS_PER_HOUR * (1 + MA_LABOR_RATE_DELTA))
    );
  });

  it("materialsEstimateCents ignores customer-supplied and missing cost", () => {
    const cents = materialsEstimateCents(sampleExtraction().materials);
    expect(cents).toBe(2800);
  });

  it("finalizeTmDraft builds mid-point labor/travel lines at Dovetails rates", () => {
    const draft = finalizeTmDraft(sampleExtraction());
    expect(draft.is_ma).toBe(true);
    expect(draft.labor_mid_hours).toBe(17);
    expect(draft.travel_mid_hours).toBe(3.5);
    expect(draft.line_items.length).toBeGreaterThanOrEqual(2);

    const laborLine = draft.line_items.find((l) => l.description.includes("on-site labor"));
    expect(laborLine).toBeDefined();
    expect(laborLine!.quantity).toBe(17);
    expect(laborLine!.unit_price_cents).toBe(draft.labor_rate_cents);
    // Must NOT use pasted $85
    expect(laborLine!.unit_price_cents).not.toBe(8500);

    expect(draft.total_estimate_cents_min).toBe(
      draft.labor_total_cents_min + draft.travel_total_cents_min + draft.materials_estimate_cents
    );
    expect(draft.total_estimate_cents_max).toBeGreaterThan(draft.total_estimate_cents_min);
    expect(draft.shopping_list).not.toBeNull();
    expect(draft.guardrails.trip_count).toBe("multi_trip");
    expect(draft.guardrails.requires_drying_or_curing).toBe(true);
  });

  it("customer notes include T&M language and rate", () => {
    const draft = finalizeTmDraft(sampleExtraction());
    const notes = draft.notes.toLowerCase();
    expect(notes).toContain("time-and-materials");
    expect(notes).toContain("maynard");
    expect(draft.notes).toContain(`$${(draft.labor_rate_cents / 100).toFixed(2)}`);
  });

  it("internal notes flag ignored pasted rate", () => {
    const notes = buildTmInternalNotes(sampleExtraction(), 13225, 8500);
    expect(notes).toContain("$85.00");
    expect(notes.toLowerCase()).toMatch(/ignored|paste/);
  });

  it("buildTmCustomerNotes works without model customer_notes", () => {
    const extraction = sampleExtraction({ customer_notes: "" });
    const text = buildTmCustomerNotes(extraction, 11500, {
      laborMin: 184000,
      laborMax: 207000,
      travelMin: 34500,
      travelMax: 46000,
      materials: 2800,
      totalMin: 221300,
      totalMax: 255800,
    });
    expect(text.toLowerCase()).toContain("time-and-materials");
    expect(text).toContain("$115.00");
  });

  it("NH job uses base rate and can be zero travel", () => {
    const draft = finalizeTmDraft(
      sampleExtraction({
        location_city: "Derry",
        location_state: "NH",
        travel_hours_min: 0,
        travel_hours_max: 0,
        pasted_rate_cents: null,
      })
    );
    expect(draft.is_ma).toBe(false);
    expect(draft.labor_rate_cents).toBe(LABOR_CUSTOMER_RATE_CENTS_PER_HOUR);
    expect(draft.line_items.some((l) => l.description.includes("travel"))).toBe(false);
  });
});
