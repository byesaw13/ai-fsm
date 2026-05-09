import { describe, expect, it } from "vitest";
import { checkSchedulingPreconditions } from "../scheduling-guard";

describe("checkSchedulingPreconditions", () => {
  it("returns ok when the job can be scheduled", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "quoted",
      activeVisitCount: 0,
    })).toEqual({ ok: true });
  });

  it("returns JOB_NOT_FOUND when job status is missing", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: null,
      activeVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_FOUND" });
  });

  it("returns ESTIMATE_NOT_APPROVED before quoted status", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "draft",
      activeVisitCount: 0,
    })).toEqual({ ok: false, error: "ESTIMATE_NOT_APPROVED" });
  });

  it("returns ACTIVE_VISIT_EXISTS when an active visit already exists", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "quoted",
      activeVisitCount: 1,
    })).toEqual({ ok: false, error: "ACTIVE_VISIT_EXISTS" });
  });
});
