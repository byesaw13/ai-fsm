import { describe, expect, it } from "vitest";
import { derivePipelineStage, getPipelineNextAction } from "@ai-fsm/domain";

describe("derivePipelineStage", () => {
  it("routes unreviewed booking requests to New Lead", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      hasBookingRequest: true,
      bookingStatus: "pending",
    })).toBe("new_lead");
  });

  it("routes booking requests under review to New Lead", () => {
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

  it("routes manual draft jobs with no estimate to Estimate Needed", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      estimateCount: 0,
    })).toBe("estimate_needed");
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

  it("routes jobs with an active visit to Scheduled", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      activeVisitCount: 1,
    })).toBe("scheduled");
  });

  it("routes blocked jobs to Waiting based on sub_status", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      subStatus: "waiting_parts",
      activeVisitCount: 1,
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

  it("routes in-progress visits to In Progress", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      inProgressVisitCount: 1,
    })).toBe("in_progress");
  });

  it("routes completed work without an invoice to Completed", () => {
    expect(derivePipelineStage({
      jobStatus: "completed",
      completedVisitCount: 1,
    })).toBe("completed");
  });

  it("routes any invoice (paid or unpaid) to Invoiced", () => {
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
      activeVisitCount: 1,
    })).toBe("scheduled");

    expect(derivePipelineStage({
      jobStatus: "completed",
      approvedEstimateCount: 1,
      completedVisitCount: 1,
    })).toBe("completed");
  });
});

describe("getPipelineNextAction", () => {
  it("returns action labels for each stage", () => {
    expect(getPipelineNextAction("new_lead")).toBe("Review intake");
    expect(getPipelineNextAction("completed")).toBe("Send invoice");
    expect(getPipelineNextAction("invoiced")).toBe("Collect payment");
    expect(getPipelineNextAction("archived")).toBe("Closed");
  });
});
