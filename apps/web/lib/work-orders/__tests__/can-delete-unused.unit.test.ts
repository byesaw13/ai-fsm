import { describe, expect, it } from "vitest";
import { canDeleteUnusedWorkOrder } from "../can-delete-unused";

describe("canDeleteUnusedWorkOrder", () => {
  it("allows cancelled WO with no visits", () => {
    expect(canDeleteUnusedWorkOrder({ status: "cancelled", visit_count: 0 })).toBe(true);
  });

  it("allows draft WO with no visits", () => {
    expect(canDeleteUnusedWorkOrder({ status: "draft", visit_count: 0 })).toBe(true);
  });

  it("blocks scheduled WO even with zero visits", () => {
    expect(canDeleteUnusedWorkOrder({ status: "scheduled", visit_count: 0 })).toBe(false);
  });

  it("blocks any WO that has field days", () => {
    expect(canDeleteUnusedWorkOrder({ status: "cancelled", visit_count: 2 })).toBe(false);
    expect(canDeleteUnusedWorkOrder({ status: "draft", visit_count: 1 })).toBe(false);
  });
});
