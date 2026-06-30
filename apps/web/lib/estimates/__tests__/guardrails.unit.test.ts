import { describe, expect, it } from "vitest";
import {
  buildClientDocumentFilename,
  reviewEstimateGuardrails,
} from "../guardrails";

const baseInput = {
  trip_count: "one_trip" as const,
  requires_drying_or_curing: false,
  difficult_access: false,
  old_house_risk: false,
  coordination_required: false,
  finish_expectation: "clean" as const,
  travel_surcharge_cents: 0,
  risk_adjustment_cents: 0,
  minimum_service_override_reason: null,
  margin_pct: null,
  has_ma_regulated_items: false,
  line_item_count: 0,
};

describe("reviewEstimateGuardrails", () => {
  it("blocks estimates below the minimum service value without a structured override", () => {
    const review = reviewEstimateGuardrails({ ...baseInput, total_cents: 12500 });

    expect(review.status).toBe("blocked");
    expect(review.blockers).toContainEqual({
      field: "minimum_service_override_reason",
      message: "Total ($125.00) is below the $185.00 minimum service fee. Add a structured override to proceed.",
    });
  });

  it("passes a below-minimum estimate when a structured override is recorded", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 12500,
      minimum_service_override_reason: "bundled",
    });

    expect(review.status).toBe("passed");
    expect(review.blockers).toHaveLength(0);
  });

  it("warns when risk flags are set without a risk adjustment", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 30000,
      difficult_access: true,
      old_house_risk: true,
      finish_expectation: "premium",
    });

    expect(review.status).toBe("passed");
    expect(review.warnings.some((w) => w.field === "risk_adjustment_cents" && w.message.includes("surcharge"))).toBe(true);
  });

  it("blocks estimates below 30% gross margin", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 25000,
      margin_pct: 0.22,
    });

    expect(review.status).toBe("blocked");
    expect(review.blockers.some((b) => b.field === "margin_pct")).toBe(true);
  });

  it("warns when MA-regulated items are present", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 25000,
      has_ma_regulated_items: true,
    });

    expect(review.warnings.some((w) => w.field === "legal")).toBe(true);
  });

  it("warns when 4 or more line items suggest block pricing", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 60000,
      line_item_count: 4,
    });

    expect(review.warnings.some((w) => w.field === "pricing")).toBe(true);
  });

  it("warns on multi-trip work without a risk adjustment", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 30000,
      trip_count: "multi_trip",
      risk_adjustment_cents: 0,
    });

    expect(review.warnings.some((w) => w.field === "risk_adjustment_cents")).toBe(true);
  });

  it("passes multi-trip work when a risk adjustment is captured", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 30000,
      trip_count: "multi_trip",
      risk_adjustment_cents: 7500,
    });

    expect(review.warnings.some((w) => w.field === "risk_adjustment_cents")).toBe(false);
  });

  it("does not warn on risk flags when travel surcharge is present", () => {
    const review = reviewEstimateGuardrails({
      ...baseInput,
      total_cents: 30000,
      difficult_access: true,
      travel_surcharge_cents: 7500,
      risk_adjustment_cents: 0,
    });

    expect(review.warnings.some((w) => w.field === "risk_adjustment_cents")).toBe(false);
  });
});

describe("buildClientDocumentFilename", () => {
  it("builds the Dovetails client document filename format", () => {
    expect(buildClientDocumentFilename({
      date: "2026-05-04T10:00:00.000Z",
      clientName: "Jane Smith",
      jobType: "handyman repair",
      documentType: "estimate",
      status: "draft",
    })).toBe("2026-05-04_Smith_HandymanRepair_Estimate_Draft");
  });
});
