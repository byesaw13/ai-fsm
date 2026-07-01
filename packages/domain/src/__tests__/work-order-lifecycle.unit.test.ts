import { describe, it, expect } from "vitest";
import { deriveWorkOrderStatus } from "../work-order-lifecycle";
import type { CompletionCriterion } from "../completion-criteria";

const criteria: CompletionCriterion[] = [
  { id: "1", label: "Install vanity", required: true, completed: false },
];

const now = new Date("2026-07-01T12:00:00Z");

describe("deriveWorkOrderStatus", () => {
  it("stays ready when no visits exist", () => {
    expect(
      deriveWorkOrderStatus({ currentStatus: "ready", visits: [], completionCriteria: criteria, now }),
    ).toBe("ready");
  });

  it("becomes scheduled when a future visit exists", () => {
    expect(
      deriveWorkOrderStatus({
        currentStatus: "ready",
        visits: [{ status: "scheduled", scheduled_start: "2026-07-05T09:00:00Z" }],
        completionCriteria: criteria,
        now,
      }),
    ).toBe("scheduled");
  });

  it("becomes dispatched when a visit is in the field", () => {
    expect(
      deriveWorkOrderStatus({
        currentStatus: "scheduled",
        visits: [{ status: "traveling", scheduled_start: "2026-07-01T09:00:00Z" }],
        completionCriteria: criteria,
        now,
      }),
    ).toBe("dispatched");
  });

  it("completes when all visits done and criteria met", () => {
    expect(
      deriveWorkOrderStatus({
        currentStatus: "dispatched",
        visits: [{ status: "completed", scheduled_start: "2026-06-28T09:00:00Z" }],
        completionCriteria: [{ ...criteria[0], completed: true }],
        now,
      }),
    ).toBe("completed");
  });

  it("does not complete when criteria remain unchecked", () => {
    expect(
      deriveWorkOrderStatus({
        currentStatus: "dispatched",
        visits: [{ status: "completed", scheduled_start: "2026-06-28T09:00:00Z" }],
        completionCriteria: criteria,
        now,
      }),
    ).toBe("ready");
  });

  it("respects manual waiting hold", () => {
    expect(
      deriveWorkOrderStatus({
        currentStatus: "waiting",
        visits: [{ status: "scheduled", scheduled_start: "2026-07-05T09:00:00Z" }],
        completionCriteria: criteria,
        now,
      }),
    ).toBe("waiting");
  });

  it("never changes cancelled", () => {
    expect(
      deriveWorkOrderStatus({
        currentStatus: "cancelled",
        visits: [{ status: "in_progress", scheduled_start: "2026-07-01T09:00:00Z" }],
        completionCriteria: criteria,
        now,
      }),
    ).toBe("cancelled");
  });
});