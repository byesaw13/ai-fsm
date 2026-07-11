import { describe, expect, it } from "vitest";
import {
  checkSchedulingPreconditions,
  FIELD_ACTIVE_VISIT_STATUSES,
  SCHEDULABLE_JOB_STATUSES,
} from "../scheduling-guard";

describe("checkSchedulingPreconditions", () => {
  it("returns ok when a draft job can be scheduled", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "draft",
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: true });
  });

  it("returns ok when a quoted job can be scheduled", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "quoted",
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: true });
  });

  it("returns ok for in_progress jobs so multi-day work can keep booking", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "in_progress",
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: true });
  });

  it("returns ok when other scheduled (future) days already exist", () => {
    // Callers pass fieldActive=0 even if scheduled visits exist.
    expect(checkSchedulingPreconditions({
      jobStatus: "scheduled",
      fieldActiveVisitCount: 0,
      // legacy activeVisitCount with 0 field-active should not block when only fieldActive is set
    })).toEqual({ ok: true });
  });

  it("returns JOB_NOT_FOUND when job status is missing", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: null,
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_FOUND" });
  });

  it("returns JOB_NOT_SCHEDULABLE after the project is closed", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "completed",
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_SCHEDULABLE" });

    expect(checkSchedulingPreconditions({
      jobStatus: "invoiced",
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_SCHEDULABLE" });

    expect(checkSchedulingPreconditions({
      jobStatus: "cancelled",
      fieldActiveVisitCount: 0,
    })).toEqual({ ok: false, error: "JOB_NOT_SCHEDULABLE" });
  });

  it("returns ACTIVE_VISIT_EXISTS when a field-active visit is underway", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "scheduled",
      fieldActiveVisitCount: 1,
    })).toEqual({ ok: false, error: "ACTIVE_VISIT_EXISTS" });
  });

  it("returns VISIT_OVERLAP when the new window collides with an existing visit", () => {
    expect(checkSchedulingPreconditions({
      jobStatus: "scheduled",
      fieldActiveVisitCount: 0,
      overlappingVisitCount: 1,
    })).toEqual({ ok: false, error: "VISIT_OVERLAP" });
  });

  it("exports field-active statuses without scheduled", () => {
    expect(FIELD_ACTIVE_VISIT_STATUSES).not.toContain("scheduled");
    expect(FIELD_ACTIVE_VISIT_STATUSES).toContain("in_progress");
    expect(SCHEDULABLE_JOB_STATUSES).toContain("in_progress");
  });
});
