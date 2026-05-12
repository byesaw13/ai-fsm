import { describe, expect, it } from "vitest";
import { derivePipelineStage, getPipelineNextAction } from "../stages";

describe("derivePipelineStage", () => {
  it("starts pending booking requests in New Intake", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      hasBookingRequest: true,
      bookingStatus: "pending",
    })).toBe("new_intake");
  });

  it("routes reviewed intake to Scope Ready", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      hasBookingRequest: true,
      bookingStatus: "reviewed",
    })).toBe("scope_ready");
  });

  it("routes manual draft jobs with no estimate to Estimate Needed", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      estimateCount: 0,
    })).toBe("estimate_needed");
  });

  it("puts sent or quoted work in Estimate Sent until approval", () => {
    expect(derivePipelineStage({
      jobStatus: "quoted",
      sentEstimateCount: 1,
    })).toBe("estimate_sent");
  });

  it("puts approved estimates in Approved / Ready until scheduling", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      approvedEstimateCount: 1,
    })).toBe("approved_ready");
  });

  it("prioritizes field and billing states over earlier intake flags", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      hasBookingRequest: true,
      bookingStatus: "pending",
      activeVisitCount: 1,
    })).toBe("scheduled");

    expect(derivePipelineStage({
      jobStatus: "completed",
      approvedEstimateCount: 1,
      completedVisitCount: 1,
    })).toBe("complete_needs_invoice");

    expect(derivePipelineStage({
      jobStatus: "completed",
      unpaidInvoiceCount: 1,
    })).toBe("invoice_sent");
  });

  it("treats paid invoices and invoiced jobs as closed", () => {
    expect(derivePipelineStage({
      jobStatus: "completed",
      paidInvoiceCount: 1,
    })).toBe("paid_closed");

    expect(derivePipelineStage({
      jobStatus: "invoiced",
    })).toBe("paid_closed");
  });
});

describe("getPipelineNextAction", () => {
  it("returns procedural labels for card CTAs", () => {
    expect(getPipelineNextAction("new_intake")).toBe("Review intake");
    expect(getPipelineNextAction("complete_needs_invoice")).toBe("Create final invoice");
  });
});
