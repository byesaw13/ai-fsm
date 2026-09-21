import { describe, expect, it } from "vitest";
import {
  defaultStopReason,
  isOpenJobStatus,
  looksLikeStorePlace,
  stopCreatesJob,
  stopReasonOptions,
  stopRequiresNotes,
  shouldSkipNightStopInterview,
} from "./stop-interview";

describe("stop interview (TASK-145)", () => {
  it("4 Ash open job defaults to work on this job", () => {
    expect(isOpenJobStatus("in_progress")).toBe(true);
    expect(defaultStopReason({ hasOpenJob: true, looksLikeStore: false })).toBe("job_work");
    expect(stopReasonOptions({ hasOpenJob: true, hasProperty: true })).toContain("job_work");
  });

  it("invoiced Landing does not default to job_work and offers new work", () => {
    expect(isOpenJobStatus("invoiced")).toBe(false);
    expect(isOpenJobStatus("completed")).toBe(false);
    expect(defaultStopReason({ hasOpenJob: false, looksLikeStore: false })).toBeNull();
    const opts = stopReasonOptions({ hasOpenJob: false, hasProperty: true });
    expect(opts).toContain("new_work");
    expect(opts).not.toContain("job_work");
    expect(stopCreatesJob("new_work")).toBe(true);
  });

  it("Home Depot defaults to store", () => {
    expect(looksLikeStorePlace("Home Depot")).toBe(true);
    expect(defaultStopReason({ hasOpenJob: false, looksLikeStore: true })).toBe("store");
    expect(stopRequiresNotes("store")).toBe(false);
  });

  it("pickup is not a bill and does not create a job", () => {
    expect(stopCreatesJob("pickup")).toBe(false);
    expect(stopRequiresNotes("pickup")).toBe(false);
  });

  it("skips night cards for a house already filed Done today", () => {
    expect(
      shouldSkipNightStopInterview({
        answeredReason: null,
        propertyId: "prop-ash",
        closedOutPropertyIds: new Set(["prop-ash"]),
      }),
    ).toBe(true);
    expect(
      shouldSkipNightStopInterview({
        answeredReason: null,
        propertyId: "prop-ash",
        closedOutPropertyIds: new Set(),
      }),
    ).toBe(false);
    expect(
      shouldSkipNightStopInterview({
        answeredReason: "job_work",
        propertyId: "prop-other",
        closedOutPropertyIds: new Set(),
      }),
    ).toBe(true);
  });

  it("unknown address without a property cannot start new work", () => {
    expect(stopReasonOptions({ hasOpenJob: false, hasProperty: false })).toEqual([
      "pickup",
      "store",
      "not_work",
    ]);
  });
});
