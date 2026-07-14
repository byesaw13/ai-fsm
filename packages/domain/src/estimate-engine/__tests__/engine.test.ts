import { describe, it, expect } from "vitest";
import { computeEstimate } from "../engine";
import { CURRENT_RULES, ENGINE_VERSION } from "../rules";
import type { EstimateSpec, PrepLevel, RoomSpec } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const wallsRoom = (sqft: number, prep: PrepLevel = "none"): RoomSpec => ({
  id: "r1", name: "Room", coats: 2,
  surfaces: [{ type: "walls", sqft, condition: "good", prep, prime: false, textureMatch: false }],
});

// ── Version & meta ────────────────────────────────────────────────────────────

describe("computeEstimate — meta", () => {
  it("stamps specVersion and rulesVersion on the result", () => {
    const spec: EstimateSpec = { engineVersion: ENGINE_VERSION, type: "general", lineItems: [] };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.specVersion).toBe(ENGINE_VERSION);
    expect(r.rulesVersion).toBe(CURRENT_RULES.version);
    expect(r.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("returns empty totals for a spec with no rooms and no line items", () => {
    const spec: EstimateSpec = { engineVersion: ENGINE_VERSION, type: "general" };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.summary.totalCents).toBe(0);
    expect(r.summary.depositCents).toBe(0);
  });
});

// ── Painting: room-by-room ────────────────────────────────────────────────────

describe("computeEstimate — painting", () => {
  it("computes labor for walls at the standard sqft rate", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "painting",
      rooms: [wallsRoom(500)],
      paintQuality: "standard",
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    // 500 sqft × $2.05 × 1.00 prep × (1 + 0.70) coats = $2.05 × 1.70 × 500
    const expectedLabor = Math.round(500 * 205 * (1.00 + 0.70));
    expect(r.summary.laborCents).toBe(expectedLabor);
  });

  it("applies major prep multiplier (1.38×) on single-coat rooms", () => {
    // Use 1 coat so the additional-coat factor doesn't muddy the ratio
    const singleCoatRoom = (prep: PrepLevel): RoomSpec => ({
      id: "r1", name: "Room", coats: 1,
      surfaces: [{ type: "walls", sqft: 200, condition: "good", prep, prime: false, textureMatch: false }],
    });
    const base = computeEstimate(
      { engineVersion: ENGINE_VERSION, type: "painting", rooms: [singleCoatRoom("none")] },
      CURRENT_RULES
    );
    const major = computeEstimate(
      { engineVersion: ENGINE_VERSION, type: "painting", rooms: [singleCoatRoom("major")] },
      CURRENT_RULES
    );
    expect(major.summary.laborCents).toBeGreaterThan(base.summary.laborCents);
    // major mult is 1.38, none is 1.00 → ratio should be 1.38
    expect(major.summary.laborCents / base.summary.laborCents).toBeCloseTo(1.38, 1);
  });

  it("includes paint material and handling lines when rooms are present", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "painting",
      rooms: [wallsRoom(300)], paintQuality: "standard",
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.lineItems.some((l) => l.category === "material")).toBe(true);
    expect(r.lineItems.some((l) => l.category === "handling")).toBe(true);
  });

  it("does not apply a deposit by default", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "painting",
      rooms: [wallsRoom(400)], paintQuality: "standard",
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.summary.depositCents).toBe(0);
    expect(r.summary.balanceDueCents).toBe(r.summary.totalCents);
  });

  it("adds ceiling surface correctly", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "painting",
      rooms: [{
        id: "r1", name: "Room", coats: 1,
        surfaces: [
          { type: "walls", sqft: 200, condition: "good", prep: "none", prime: false, textureMatch: false },
          { type: "ceiling", sqft: 100, condition: "good", prep: "none", prime: false, textureMatch: false },
        ],
      }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    const wallLine = r.lineItems.find((l) => l.description.includes("Walls"));
    const ceilLine = r.lineItems.find((l) => l.description.includes("Ceiling"));
    expect(wallLine).toBeDefined();
    expect(ceilLine).toBeDefined();
    expect(wallLine!.totalCents).toBeGreaterThan(0);
    expect(ceilLine!.totalCents).toBeGreaterThan(0);
  });
});

// ── General line items ────────────────────────────────────────────────────────

describe("computeEstimate — general", () => {
  it("computes hourly labor correctly", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Handyman", quantity: 3, unit: "hour", unitLaborCents: 11500 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.summary.laborCents).toBe(34500); // 3 × $115
  });

  it("applies 15% material handling to explicit material costs", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Door install", quantity: 1, unit: "unit", unitLaborCents: 15000, materialCents: 20000 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    const handling = r.lineItems.find((l) => l.category === "handling");
    expect(handling).toBeDefined();
    expect(handling!.totalCents).toBe(Math.round(20000 * 0.15)); // $30
  });

  it("omits handling line when no materials", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Labor only", quantity: 2, unit: "hour", unitLaborCents: 11500 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.lineItems.filter((l) => l.category === "handling")).toHaveLength(0);
  });

  it("tracks internal cost basis separate from billing amount", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Carpentry", quantity: 4, unit: "hour", unitLaborCents: 11500 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    // Billing: 4 × $115 = $460; Cost: 4hrs at laborCostCentsPerHour (default $50)
    expect(r.internalSummary.grossMarginCents).toBeGreaterThan(0);
    expect(r.internalSummary.grossMarginPct).toBeGreaterThan(0);
    expect(r.internalSummary.grossMarginPct).toBeLessThan(1);
  });
});

// ── Adjustments ───────────────────────────────────────────────────────────────

describe("computeEstimate — adjustments", () => {
  it("adds trip fee to total and reports in adjustmentsCents", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Svc", quantity: 2, unit: "hour", unitLaborCents: 11500 }],
      adjustments: [{ id: "adj1", type: "trip_fee", label: "Return trip", amountCents: 7500 }],
      tripCount: "multi_trip",
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.summary.adjustmentsCents).toBe(7500);
    expect(r.summary.totalCents).toBe(r.summary.subtotalCents + 7500);
  });

  it("suppresses MULTI_TRIP_NO_SURCHARGE warning when trip_fee adjustment exists", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Svc", quantity: 2, unit: "hour", unitLaborCents: 11500 }],
      adjustments: [{ id: "adj1", type: "trip_fee", label: "Return trip", amountCents: 7500 }],
      tripCount: "multi_trip",
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.warnings.some((w) => w.code === "MULTI_TRIP_NO_SURCHARGE")).toBe(false);
  });
});

// ── Guardrails ────────────────────────────────────────────────────────────────

describe("computeEstimate — guardrails", () => {
  it("blocks when total is below minimum and no override", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Small job", quantity: 1, unit: "flat", unitLaborCents: 5000 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.warnings.some((w) => w.code === "BELOW_MINIMUM" && w.severity === "block")).toBe(true);
  });

  it("does not block when override is present", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Bundled", quantity: 1, unit: "flat", unitLaborCents: 5000 }],
      overrides: [{ rule: "minimum_service_fee", reason: "bundled", approvedBy: "owner", approvedAt: new Date().toISOString() }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.warnings.some((w) => w.code === "BELOW_MINIMUM")).toBe(false);
  });

  it("warns when 4+ scope items are present", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [
        { id: "1", description: "Task A", quantity: 1, unit: "flat", unitLaborCents: 15000 },
        { id: "2", description: "Task B", quantity: 1, unit: "flat", unitLaborCents: 15000 },
        { id: "3", description: "Task C", quantity: 1, unit: "flat", unitLaborCents: 15000 },
        { id: "4", description: "Task D", quantity: 1, unit: "flat", unitLaborCents: 15000 },
      ],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.warnings.some((w) => w.code === "BLOCK_PRICING_SUGGESTED")).toBe(true);
  });
});

// ── Views: client vs internal ──────────────────────────────────────────────────

describe("computeEstimate — views", () => {
  it("client view items do not expose costBasisCents or marginCents", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Carpentry", quantity: 4, unit: "hour", unitLaborCents: 11500 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    for (const item of r.views.client.lineItems) {
      expect(Object.keys(item)).not.toContain("costBasisCents");
      expect(Object.keys(item)).not.toContain("marginCents");
    }
  });

  it("internal view includes full line items with cost basis", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "general",
      lineItems: [{ id: "li1", description: "Carpentry", quantity: 4, unit: "hour", unitLaborCents: 11500 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    const laborLine = r.views.internal.lineItems.find((l) => l.category === "labor");
    expect(laborLine).toBeDefined();
    expect(typeof laborLine!.costBasisCents).toBe("number");
    expect(typeof laborLine!.marginCents).toBe("number");
  });

  it("audit trail has an entry for each computed rule", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "painting",
      rooms: [wallsRoom(300)], paintQuality: "standard",
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    expect(r.audit.length).toBeGreaterThan(0);
    expect(r.audit[0]).toHaveProperty("rule");
    expect(r.audit[0]).toHaveProperty("input");
    expect(r.audit[0]).toHaveProperty("output");
  });
});

// ── Mixed: painting + general ─────────────────────────────────────────────────

describe("computeEstimate — mixed spec", () => {
  it("sums painting and general line items correctly", () => {
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION, type: "repair",
      rooms: [wallsRoom(200)],
      lineItems: [{ id: "li1", description: "Door rehang", quantity: 1, unit: "unit", unitLaborCents: 8500 }],
    };
    const r = computeEstimate(spec, CURRENT_RULES);
    const paintLabor = r.lineItems.find((l) => l.roomId === "r1")!.totalCents;
    const generalLabor = r.lineItems.find((l) => l.id === "li-li1")!.totalCents;
    expect(r.summary.laborCents).toBe(paintLabor + generalLabor);
  });
});
