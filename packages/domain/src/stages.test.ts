import { describe, it, expect } from "vitest";
import { deriveCustomerStage, derivePortalStage, derivePipelineStage } from "./stages";

describe("deriveCustomerStage", () => {
  it("draft → intake", () => {
    expect(deriveCustomerStage({ jobStatus: "draft" })).toBe("intake");
  });

  it("draft with approved estimate still → intake (estimate on wrong job)", () => {
    expect(deriveCustomerStage({ jobStatus: "draft", hasApprovedEstimate: true })).toBe("intake");
  });

  it("quoted, no approved estimate → estimate", () => {
    expect(deriveCustomerStage({ jobStatus: "quoted" })).toBe("estimate");
  });

  it("quoted + approved estimate, no visit → accepted", () => {
    expect(deriveCustomerStage({ jobStatus: "quoted", hasApprovedEstimate: true })).toBe("accepted");
  });

  it("quoted + active visit (regardless of estimate) → scheduled", () => {
    expect(deriveCustomerStage({ jobStatus: "quoted", hasActiveVisit: true })).toBe("scheduled");
    expect(deriveCustomerStage({ jobStatus: "quoted", hasApprovedEstimate: true, hasActiveVisit: true })).toBe("scheduled");
  });

  it("scheduled → scheduled", () => {
    expect(deriveCustomerStage({ jobStatus: "scheduled" })).toBe("scheduled");
  });

  it("in_progress → scheduled", () => {
    expect(deriveCustomerStage({ jobStatus: "in_progress" })).toBe("scheduled");
  });

  it("completed → completed", () => {
    expect(deriveCustomerStage({ jobStatus: "completed" })).toBe("completed");
  });

  it("invoiced → completed", () => {
    expect(deriveCustomerStage({ jobStatus: "invoiced" })).toBe("completed");
  });

  it("cancelled → completed", () => {
    expect(deriveCustomerStage({ jobStatus: "cancelled" })).toBe("completed");
  });

  it("unknown status falls back to intake", () => {
    expect(deriveCustomerStage({ jobStatus: "unknown_future_status" })).toBe("intake");
  });
});

describe("derivePortalStage", () => {
  it("no data → intake", () => {
    expect(derivePortalStage({})).toBe("intake");
  });

  it("sent estimate → estimate", () => {
    expect(derivePortalStage({ hasSentEstimate: true })).toBe("estimate");
  });

  it("approved estimate → accepted", () => {
    expect(derivePortalStage({ hasApprovedEstimate: true })).toBe("accepted");
  });

  it("approved + sent → accepted (approved takes precedence)", () => {
    expect(derivePortalStage({ hasApprovedEstimate: true, hasSentEstimate: true })).toBe("accepted");
  });

  it("scheduled visit → scheduled", () => {
    expect(derivePortalStage({ hasScheduledVisit: true })).toBe("scheduled");
  });

  it("scheduled visit overrides approved estimate", () => {
    expect(derivePortalStage({ hasScheduledVisit: true, hasApprovedEstimate: true })).toBe("scheduled");
  });

  it("open invoice → completed", () => {
    expect(derivePortalStage({ hasOpenInvoice: true })).toBe("completed");
  });

  it("paid invoice → completed", () => {
    expect(derivePortalStage({ hasPaidInvoice: true })).toBe("completed");
  });

  it("completed overrides everything", () => {
    expect(derivePortalStage({
      hasPaidInvoice: true,
      hasScheduledVisit: true,
      hasApprovedEstimate: true,
      hasSentEstimate: true,
    })).toBe("completed");
  });
});

describe("derivePipelineStage — pre-sale vs execution visits", () => {
  it("open site_visit in_progress only → estimate_needed, not in_progress", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      executionInProgressCount: 0,
      preSaleOpenSiteVisitCount: 1,
      inProgressVisitCount: 1,
    })).toBe("estimate_needed");
  });

  it("standard visit in_progress → in_progress", () => {
    expect(derivePipelineStage({
      jobStatus: "in_progress",
      executionInProgressCount: 1,
    })).toBe("in_progress");
  });

  it("sent estimate + open site_visit → estimate_sent", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      sentEstimateCount: 1,
      preSaleOpenSiteVisitCount: 1,
    })).toBe("estimate_sent");
  });

  it("completed pre-sale site visit with no estimate → estimate_needed", () => {
    expect(derivePipelineStage({
      jobStatus: "draft",
      completedPreSaleSiteVisit: true,
      estimateCount: 0,
    })).toBe("estimate_needed");
  });

  it("falls back to legacy visit counts when execution counts are absent", () => {
    expect(derivePipelineStage({
      jobStatus: "scheduled",
      inProgressVisitCount: 1,
    })).toBe("in_progress");

    expect(derivePipelineStage({
      jobStatus: "draft",
      activeVisitCount: 1,
    })).toBe("scheduled");
  });
});
