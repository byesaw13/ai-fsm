import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { computeHourlyBaseline, type BaselineInput, type PreparedScope } from "@ai-fsm/domain";
import {
  REVIEW_MODEL,
  ReviewFailedError,
  buildReviewMessage,
  preparedScopeGaps,
  reviewEstimate,
  ruleBasedReview,
  type ReviewInput,
} from "../review";

// Fixture A (docs/working/hourly-baseline.md): eight areas, four with no paint priced.
const AREAS = [
  ["protection", "Protection, setup and general prep", 9, 16, 30000],
  ["bedroom", "Bedroom", 13.25, 20.25, 29500],
  ["pantry", "Pantry", 2, 3, null],
  ["kitchen", "Kitchen", 8, 12, null],
  ["office", "Office", 7.5, 10.25, 22500],
  ["hall", "Hall", 7, 10, null],
  ["foyer", "Foyer", 12, 20, null],
  ["living", "Living room", 29, 40.75, 63000],
] as const;

const fixtureScope: PreparedScope = {
  version: 1,
  source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
  groups: AREAS.map(([key, label]) => ({ key, label })),
  tasks: [
    ...AREAS.map(([key, label, low, high, materials]) => ({
      id: key,
      room_id: null,
      description: label,
      kind: "requested" as const,
      confirmed: true,
      group_key: key,
      quantity_key: null,
      count: null,
      quantity: null,
      hours_low: low,
      hours_high: high,
      hours_source: "ai_allowance" as const,
      materials_cents: materials,
    })),
    {
      id: "closet",
      room_id: null,
      description: "Paint the hall closet",
      kind: "suggested" as const,
      confirmed: false,
      group_key: "hall",
      quantity_key: null,
      count: null,
      quantity: null,
      hours_low: 1,
      hours_high: 2,
      hours_source: "ai_allowance" as const,
      materials_cents: null,
    },
  ],
  questions: [
    { id: "q1", task_ids: ["kitchen"], text: "Are the kitchen cabinets included?", answer: null },
    { id: "q2", task_ids: ["bedroom"], text: "Ceiling too?", answer: "Yes" },
  ],
  alternatives: [],
  exclusions: [],
};

const QUARTER: Record<string, number> = {
  protection: 12.5, bedroom: 16.75, pantry: 2.5, kitchen: 10, office: 9, hall: 8.5, foyer: 16, living: 35,
};

function fixtureInput(): ReviewInput {
  const lines = [
    ...AREAS.map(([key, label, low, high]) => ({
      type: "labor" as const,
      description: label,
      quantity: 1,
      price_cents: Math.round(QUARTER[key] * 8500),
      cost_cents: null,
      hours_low: low,
      hours_high: high,
      hours_source: "ai_allowance",
    })),
    ...AREAS.filter(([, , , , m]) => m !== null).map(([, label, , , m]) => ({
      type: "materials" as const,
      description: `${label} materials`,
      quantity: 1,
      price_cents: m as number,
      cost_cents: m as number,
      hours_low: null,
      hours_high: null,
      hours_source: null,
    })),
  ];
  const baselineInput: BaselineInput = {
    lines: lines.map((l) => ({
      type: l.type,
      isTravelTime: false,
      hoursLow: l.hours_low,
      hoursHigh: l.hours_high,
      costCents: l.cost_cents,
      priceCents: l.price_cents,
    })),
    estimateHours: null,
    travelSurchargeCents: 0,
    sellRateCents: 8500,
    costFloorCents: 5000,
    handlingPct: 15,
    handlingOn: false,
    otherDirectCents: 0,
    otherDirectConfirmed: true,
    quotedCents: 1082125,
    warningPct: 10,
  };
  return {
    billing_method: "time_and_materials",
    quoted_cents: 1082125,
    rates: { sell_rate_cents: 8500, cost_floor_cents: 5000, handling_pct: 15, warning_pct: 10, handling_in_baseline: false },
    baseline: computeHourlyBaseline(baselineInput),
    lines,
    prepared_gaps: preparedScopeGaps(fixtureScope),
    notes: null,
  };
}

function fakeClient(message: Partial<Anthropic.Message>) {
  const stream = vi.fn(() => ({ finalMessage: async () => message as Anthropic.Message }));
  return { client: { messages: { stream } } as unknown as Anthropic, stream };
}

const goodToolUse = {
  type: "tool_use" as const,
  id: "toolu_1",
  name: "review_estimate",
  input: {
    score: 80,
    summary: "Four areas have hours and no paint priced.",
    suggestions: [
      { type: "warning", field: "materials", message: "Pantry, Kitchen, Hall and Foyer have no paint priced.", suggestion: "Price their paint." },
    ],
  },
};

describe("preparedScopeGaps", () => {
  it("names Pantry, Kitchen, Hall and Foyer as having hours but no materials price", () => {
    expect(preparedScopeGaps(fixtureScope)).toEqual({
      hours_without_materials_price: ["Pantry", "Kitchen", "Hall", "Foyer"],
      unconfirmed_tasks: ["Paint the hall closet"],
      open_questions: ["Are the kitchen cabinets included?"],
    });
  });

  it("an itemized group with a priced line is not a gap", () => {
    const scope: PreparedScope = {
      ...fixtureScope,
      materials: {
        pantry: { lines: [{ id: "l1", name: "Paint", quantity: 1, unit: "gal", unit_cost_cents: 4500, source: "owner" }] },
      } as unknown as PreparedScope["materials"],
    };
    expect(preparedScopeGaps(scope).hours_without_materials_price).not.toContain("Pantry");
  });
});

describe("buildReviewMessage", () => {
  it("carries the baseline, every line and the gaps, and nothing about square footage", () => {
    const text = buildReviewMessage(fixtureInput());
    for (const area of ["Pantry", "Kitchen", "Hall", "Foyer"]) expect(text).toContain(area);
    expect(text).toContain("\"effectiveRateCents\": 7086");
    expect(text).toContain("\"sell_rate_cents\": 8500");
    expect(text).not.toMatch(/sq_ft|square f|sq ft/i);
  });
});

describe("ruleBasedReview", () => {
  it("names the areas missing materials, the open question and the unconfirmed task", () => {
    const r = ruleBasedReview(fixtureInput());
    const text = r.suggestions.map((s) => `${s.message} ${s.suggestion}`).join(" ");
    for (const area of ["Pantry", "Kitchen", "Hall", "Foyer"]) expect(text).toContain(area);
    expect(text).toContain("kitchen cabinets");
    expect(text).toContain("hall closet");
    expect(text).not.toMatch(/square f|sq ft/i);
    expect(r.score).toBeLessThan(100);
  });

  it("reports the cost floor and a gap below the baseline", () => {
    const input = fixtureInput();
    input.prepared_gaps = null;
    input.baseline = { ...input.baseline!, belowCostFloor: true, effectiveRateCents: 4500, warning: "strong", gapCents: -216000, gapPct: -20 };
    const r = ruleBasedReview(input);
    expect(r.suggestions.map((s) => s.field)).toEqual(expect.arrayContaining(["pricing", "baseline"]));
  });
});

describe("option quotes", () => {
  it("reviews each option's own lines and names them with their option", () => {
    const input: ReviewInput = {
      ...fixtureInput(),
      billing_method: "option_quote",
      baseline: null,
      prepared_gaps: null,
      lines: [
        { type: "labor", description: "Patch and paint", quantity: 1, price_cents: 60000, cost_cents: null, hours_low: null, hours_high: null, hours_source: null, option: "Good" },
        { type: "labor", description: "Patch and paint", quantity: 1, price_cents: 90000, cost_cents: null, hours_low: 8, hours_high: 10, hours_source: "owner", option: "Best" },
      ],
    };
    const r = ruleBasedReview(input);
    expect(r.suggestions.map((s) => s.message).join(" ")).toContain("Patch and paint (Good)");
    expect(r.summary).not.toContain("No problems");
    expect(buildReviewMessage(input)).toContain('"option": "Best"');
  });
});

describe("reviewEstimate", () => {
  it("uses the current model, forces the review tool and validates the result", async () => {
    const { client, stream } = fakeClient({ stop_reason: "tool_use", content: [goodToolUse] as Anthropic.ContentBlock[] });
    const r = await reviewEstimate(fixtureInput(), client);
    expect(r.summary).toContain("Four areas");
    const params = (stream.mock.calls[0] as unknown[])[0] as Anthropic.MessageStreamParams;
    expect(params.model).toBe(REVIEW_MODEL);
    expect(REVIEW_MODEL).toBe("claude-opus-4-7");
    expect(params.tool_choice).toEqual({ type: "tool", name: "review_estimate" });
    const system = JSON.stringify(params.system);
    expect(system).not.toMatch(/sq ft|\$85/);
  });

  it("treats a cut-off response as an error", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", content: [goodToolUse] as Anthropic.ContentBlock[] });
    await expect(reviewEstimate(fixtureInput(), client)).rejects.toBeInstanceOf(ReviewFailedError);
  });

  it("rejects output that does not match the schema", async () => {
    const bad = { ...goodToolUse, input: { score: 300, summary: "x", suggestions: [] } };
    const { client } = fakeClient({ stop_reason: "tool_use", content: [bad] as Anthropic.ContentBlock[] });
    await expect(reviewEstimate(fixtureInput(), client)).rejects.toBeInstanceOf(ReviewFailedError);
  });

  it("treats a refusal or a missing tool call as an error", async () => {
    const refused = fakeClient({ stop_reason: "refusal", content: [] });
    await expect(reviewEstimate(fixtureInput(), refused.client)).rejects.toBeInstanceOf(ReviewFailedError);
    const noTool = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "hi", citations: null }] as Anthropic.ContentBlock[] });
    await expect(reviewEstimate(fixtureInput(), noTool.client)).rejects.toBeInstanceOf(ReviewFailedError);
  });
});
