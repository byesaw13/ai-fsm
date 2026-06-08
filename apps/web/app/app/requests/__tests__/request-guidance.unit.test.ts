import { describe, expect, it } from "vitest";
import { getRequestGuidance } from "../request-guidance";

describe("getRequestGuidance", () => {
  it("treats a remote estimate request as Create Estimate", () => {
    const guidance = getRequestGuidance({
      status: "pending",
      pricing_mode: "flat_rate",
      routing_path: "remote_estimate",
      job_id: null,
      visit_id: null,
      walkthrough_score: null,
    });

    expect(guidance.primaryActionKind).toBe("create_estimate");
    expect(guidance.recommendedLabel).toBe("Create Estimate");
    expect(guidance.destinationRecord).toBe("Estimate");
    expect(guidance.requestTypeLabel).toBe("Fixed Bid");
  });

  it("treats a handyman repair request as Create Job", () => {
    const guidance = getRequestGuidance({
      status: "pending",
      pricing_mode: "hourly_internal",
      routing_path: "pending",
      job_id: null,
      visit_id: null,
      walkthrough_score: null,
    });

    expect(guidance.primaryActionKind).toBe("create_job");
    expect(guidance.recommendedLabel).toBe("Create Job");
    expect(guidance.destinationRecord).toBe("Job");
    expect(guidance.requestTypeLabel).toBe("Time and Materials");
  });

  it("treats a walkthrough request with a job as Schedule Walkthrough", () => {
    const guidance = getRequestGuidance({
      status: "reviewed",
      pricing_mode: "flat_rate",
      routing_path: "site_visit",
      job_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      visit_id: null,
      walkthrough_score: 80,
    });

    expect(guidance.primaryActionKind).toBe("schedule_walkthrough");
    expect(guidance.recommendedLabel).toBe("Schedule Walkthrough");
    expect(guidance.destinationRecord).toBe("Visit");
  });

  it("treats a closed request as Close Request", () => {
    const guidance = getRequestGuidance({
      status: "cancelled",
      pricing_mode: null,
      routing_path: null,
      job_id: null,
      visit_id: null,
      walkthrough_score: null,
    });

    expect(guidance.primaryActionKind).toBe("close_request");
    expect(guidance.recommendedLabel).toBe("Close Request");
    expect(guidance.destinationRecord).toBe("Closed request");
  });
});
