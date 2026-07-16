import { describe, expect, it } from "vitest";
import { derivePipelineStage } from "@ai-fsm/domain";

describe("derivePipelineStage", () => {
  it("routes unreviewed booking requests to Request", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      hasBookingRequest: true,
      bookingStatus: "pending",
    })).toBe("new_lead");
  });

  it("routes booking requests under review to Request", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      hasBookingRequest: true,
      bookingStatus: "needs_info",
    })).toBe("new_lead");

    expect(derivePipelineStage({
      jobStatus: "draft",
      hasBookingRequest: true,
      bookingStatus: "reviewed",
    })).toBe("new_lead");
  });

  it("routes manual draft jobs with no estimate to Ready to Schedule (T&M)", () => {
    // Not every job needs an estimate — day/T&M work skips estimate_needed.
    expect(derivePipelineStage({
      jobStatus: "draft",
      estimateCount: 0,
    })).toBe("approved_ready");
  });

  it("routes quoted jobs or sent estimates to Estimate Sent", () => {
    expect(derivePipelineStage({
      jobStatus: "quoted",
      sentEstimateCount: 1,
    })).toBe("estimate_sent");

    expect(derivePipelineStage({
      jobStatus: "draft",
      sentEstimateCount: 1,
    })).toBe("estimate_sent");
  });

  it("routes approved estimates without a visit to Approved / Ready", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      approvedEstimateCount: 1,
    })).toBe("approved_ready");
  });

  it("routes jobs with an active execution visit to Scheduled", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      executionActiveVisitCount: 1,
    })).toBe("scheduled");
  });

  it("routes blocked jobs to Waiting based on sub_status", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      subStatus: "waiting_parts",
      executionActiveVisitCount: 1,
    })).toBe("waiting");

    expect(derivePipelineStage({
      jobStatus: "in_progress",
      subStatus: "customer_hold",
    })).toBe("waiting");

    expect(derivePipelineStage({
      jobStatus: "in_progress",
      subStatus: "weather_hold",
    })).toBe("waiting");
  });

  it("routes in-progress execution visits to In Progress", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      executionInProgressCount: 1,
    })).toBe("in_progress");
  });

  it("routes owner-completed work without a final invoice to Ready for Closeout", () => {
    expect(derivePipelineStage({
      jobStatus: "completed",
      completedVisitCount: 1,
    })).toBe("completed");
  });

  it("does not close out from completed visits alone while project is still open", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      completedVisitCount: 1,
      openWorkOrderCount: 1,
      approvedEstimateCount: 1,
    })).toBe("in_progress");
  });

  it("routes readyForCloseout (field quiet, WOs done) to Ready for Closeout", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      completedVisitCount: 2,
      readyForCloseout: true,
      openWorkOrderCount: 0,
    })).toBe("completed");
  });

  it("does not treat paid deposits as Invoiced (paidInvoiceCount is final/standard only)", () => {
    // Callers must not pass deposit paid into paidInvoiceCount.
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      approvedEstimateCount: 1,
      completedVisitCount: 1,
      openWorkOrderCount: 1,
      paidInvoiceCount: 0,
    })).toBe("in_progress");
  });

  it("routes final/standard invoice (paid or unpaid) to Invoiced", () => {
    expect(derivePipelineStage({
      jobStatus: "completed",
      unpaidInvoiceCount: 1,
    })).toBe("invoiced");

    expect(derivePipelineStage({
      jobStatus: "completed",
      paidInvoiceCount: 1,
    })).toBe("invoiced");

    expect(derivePipelineStage({
      jobStatus: "invoiced",
    })).toBe("invoiced");
  });

  it("routes cancelled jobs to Archived", () => {
    expect(derivePipelineStage({
      jobStatus: "cancelled",
    })).toBe("archived");
  });

  it("prioritizes field and billing states over earlier intake flags", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      hasBookingRequest: true,
      bookingStatus: "pending",
      executionActiveVisitCount: 1,
    })).toBe("scheduled");

    expect(derivePipelineStage({
      jobStatus: "completed",
      approvedEstimateCount: 1,
      completedVisitCount: 1,
    })).toBe("completed");
  });

  it("does not treat pre-sale site_visit in_progress as Working", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      executionInProgressCount: 0,
      preSaleOpenSiteVisitCount: 1,
    })).toBe("estimate_needed");
  });

  it("keeps estimate_sent when estimate is out despite open site_visit", () => {
    expect(derivePipelineStage({
      jobStatus: "quoted",
      sentEstimateCount: 1,
      preSaleOpenSiteVisitCount: 1,
    })).toBe("estimate_sent");
  });

  it("does not treat completed pre-sale site_visit as execution closeout", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      completedPreSaleSiteVisit: true,
      completedVisitCount: 0,
      estimateCount: 0,
    })).toBe("estimate_needed");

    expect(derivePipelineStage({
      jobStatus: "draft",
      completedPreSaleSiteVisit: true,
      completedVisitCount: 0,
      estimateCount: 0,
    })).not.toBe("completed");
  });
});
