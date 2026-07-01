import { describe, expect, it } from "vitest";
import {
  EXECUTION_VISIT_TYPES,
  OPERATIONAL_VISIT_TYPES,
  VISIT_TYPES,
  visitStatusSchema,
  visitTransitions,
  workOrderStatusSchema,
  WORK_ORDER_UI_STATUSES,
} from "./statuses";

describe("visit execution statuses (Slice 1)", () => {
  it("includes dispatch and travel states separate from work order dispatched", () => {
    expect(visitStatusSchema.options).toEqual([
      "scheduled",
      "dispatched",
      "traveling",
      "arrived",
      "in_progress",
      "waiting",
      "completed",
      "cancelled",
    ]);
  });

  it("allows scheduled to skip dispatch and arrive directly (legacy path)", () => {
    expect(visitTransitions.scheduled).toContain("arrived");
    expect(visitTransitions.scheduled).toContain("dispatched");
  });
});

describe("work order planning statuses (Slice 1)", () => {
  it("exposes v1 UI statuses without approved/closed", () => {
    expect(WORK_ORDER_UI_STATUSES).toEqual([
      "draft",
      "ready",
      "scheduled",
      "dispatched",
      "waiting",
      "completed",
      "cancelled",
    ]);
    expect(WORK_ORDER_UI_STATUSES).not.toContain("approved");
    expect(WORK_ORDER_UI_STATUSES).not.toContain("closed");
  });

  it("reserves approved and closed in the DB schema enum", () => {
    expect(workOrderStatusSchema.options).toContain("approved");
    expect(workOrderStatusSchema.options).toContain("closed");
  });
});

describe("visit_type work_order rules", () => {
  it("partitions execution vs operational visit types", () => {
    expect(EXECUTION_VISIT_TYPES).toEqual(["standard", "punch_list"]);
    expect(OPERATIONAL_VISIT_TYPES).toContain("sales_walkthrough");
    expect([...EXECUTION_VISIT_TYPES, ...OPERATIONAL_VISIT_TYPES].sort()).toEqual(
      [...VISIT_TYPES].sort(),
    );
  });
});