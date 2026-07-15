import { describe, expect, it } from "vitest";
import { getRequestGuidance } from "../request-guidance";

describe("getRequestGuidance", () => {
  it("requires path choice when routing is pending", () => {
    const guidance = getRequestGuidance({
      status: "pending",
      pricing_mode: "flat_rate",
      routing_path: "pending",
      job_id: "job-1",
      visit_id: null,
      walkthrough_score: null,
    });

    expect(guidance.primaryActionKind).toBe("choose_path");
    expect(guidance.recommendedLabel).toMatch(/Choose how to proceed/i);
    expect(guidance.requestTypeLabel).toBe("Needs path");
  });

  it("treats remote estimate as Create Estimate", () => {
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
    expect(guidance.requestTypeLabel).toBe("Remote estimate");
  });

  it("treats site_visit path with job as Schedule Assessment", () => {
    const guidance = getRequestGuidance({
      status: "reviewed",
      pricing_mode: "flat_rate",
      routing_path: "site_visit",
      job_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      visit_id: null,
      walkthrough_score: 80,
    });

    expect(guidance.primaryActionKind).toBe("schedule_assessment");
    expect(guidance.recommendedLabel).toBe("Schedule Assessment");
    expect(guidance.destinationRecord).toBe("Assessment");
    expect(guidance.requestTypeLabel).toBe("Assessment first");
  });

  it("treats book_work path with job as Schedule Work Day", () => {
    const guidance = getRequestGuidance({
      status: "pending",
      pricing_mode: "hourly_internal",
      routing_path: "book_work",
      job_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      visit_id: null,
      walkthrough_score: null,
    });

    expect(guidance.primaryActionKind).toBe("schedule_work");
    expect(guidance.recommendedLabel).toBe("Schedule Work Day");
    expect(guidance.destinationRecord).toBe("Work Day");
  });

  it("asks for project when book_work has no job", () => {
    const guidance = getRequestGuidance({
      status: "pending",
      pricing_mode: null,
      routing_path: "book_work",
      job_id: null,
      visit_id: null,
      walkthrough_score: null,
    });

    expect(guidance.primaryActionKind).toBe("create_job");
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
  });
});
