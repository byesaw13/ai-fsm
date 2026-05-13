import { describe, expect, it } from "vitest";
import { checkSchedulingPreconditions } from "../scheduling-guard";

describe("checkSchedulingPreconditions", () => {
  it("returns ok when a draft job can be scheduled", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "draft",
      activeVisitCount: 0,
    })).toEqual({ ok: true });
  });

  it("returns ok when a quoted job can be scheduled", () => {
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

  it("returns JOB_NOT_SCHEDULABLE after field work has started or closed", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "in_progress",
      activeVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_SCHEDULABLE" });

    expect(checkSchedulingPreconditions({
      jobStatus: "completed",
      activeVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_SCHEDULABLE" });

    expect(checkSchedulingPreconditions({
      jobStatus: "invoiced",
      activeVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_SCHEDULABLE" });
  });

  it("returns ACTIVE_VISIT_EXISTS when an active visit already exists", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "quoted",
      activeVisitCount: 1,
    })).toEqual({ ok: false, error: "ACTIVE_VISIT_EXISTS" });
  });
});
