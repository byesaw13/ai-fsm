import { describe, expect, it } from "vitest";
import {
  buildClientDocumentFilename,
  reviewEstimateGuardrails,
} from "../guardrails";

describe("reviewEstimateGuardrails", () => {
  it("blocks estimates below the minimum service value without a structured override", () => {
    const review = reviewEstimateGuardrails({
      total_cents: 12500,
      trip_count: "one_trip",
      requires_drying_or_curing: false,
      difficult_access: false,
      old_house_risk: false,
      coordination_required: false,
      finish_expectation: "clean",
      travel_surcharge_cents: 0,
      risk_adjustment_cents: 0,
      minimum_service_override_reason: null,
    });

    expect(review.status).toBe("blocked");
    expect(review.blockers).toContainEqual({
      field: "minimum_service_override_reason",
      message: "Estimate is below the $150 minimum service value and needs a structured override.",
    });
  });

  it("passes a below-minimum estimate when a structured override is recorded", () => {
    const review = reviewEstimateGuardrails({
      total_cents: 12500,
      trip_count: "one_trip",
      requires_drying_or_curing: false,
      difficult_access: false,
      old_house_risk: false,
      coordination_required: false,
      finish_expectation: "clean",
      travel_surcharge_cents: 0,
      risk_adjustment_cents: 0,
      minimum_service_override_reason: "bundled",
    });

    expect(review.status).toBe("passed");
    expect(review.blockers).toHaveLength(0);
  });

  it("warns when risk flags are set without a risk adjustment", () => {
    const review = reviewEstimateGuardrails({
      total_cents: 30000,
      trip_count: "one_trip",
      requires_drying_or_curing: false,
      difficult_access: true,
      old_house_risk: true,
      coordination_required: false,
      finish_expectation: "premium",
      travel_surcharge_cents: 0,
      risk_adjustment_cents: 0,
      minimum_service_override_reason: null,
    });

    expect(review.status).toBe("passed");
    expect(review.warnings.some((w) => w.field === "risk_adjustment_cents")).toBe(true);
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
