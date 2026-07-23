import { describe, expect, it } from "vitest";
import {
  deliverableCountsByWorkOrder,
  findUnplannedOpenTasks,
  groupPlannedTasksByVisit,
  mergeTaskOntoDayPlan,
  plannedTaskIdsOnDays,
  truncateTaskChipLabel,
} from "../project-board";

describe("groupPlannedTasksByVisit", () => {
  it("groups chips by visit", () => {
    const map = groupPlannedTasksByVisit([
      {
        visit_id: "v1",
        task_id: "t1",
        label: "Frame window",
        completed: false,
        status: "open",
      },
      {
        visit_id: "v1",
        task_id: "t2",
        label: "Install window",
        completed: true,
        status: "done",
      },
      {
        visit_id: "v2",
        task_id: "t3",
        label: "Paint",
        completed: false,
        status: "partial",
      },
    ]);
    expect(map.get("v1")).toHaveLength(2);
    expect(map.get("v1")?.[1].completed).toBe(true);
    expect(map.get("v2")?.[0].label).toBe("Paint");
  });
});

describe("findUnplannedOpenTasks", () => {
  it("excludes tasks already planned on any day", () => {
    const unplanned = findUnplannedOpenTasks(
      [
        {
          id: "a",
          label: "A",
          required: true,
          status: "open",
          work_order_id: "wo",
          work_order_title: "WO",
        },
        {
          id: "b",
          label: "B",
          required: true,
          status: "open",
          work_order_id: "wo",
          work_order_title: "WO",
        },
        {
          id: "c",
          label: "C",
          required: false,
          status: "partial",
          work_order_id: "wo",
          work_order_title: "WO",
        },
      ],
      ["a"],
    );
    expect(unplanned.map((t) => t.id)).toEqual(["b", "c"]);
  });
});

describe("plannedTaskIdsOnDays", () => {
  it("only counts tasks planned on usable field days", () => {
    const ids = plannedTaskIdsOnDays(
      [
        { visit_id: "day-open", task_id: "a" },
        { visit_id: "day-cancelled", task_id: "b" },
        { visit_id: "assessment", task_id: "c" },
      ],
      ["day-open"],
    );
    // b and c fall back to Unplanned so they can be reassigned
    expect(ids).toEqual(["a"]);
  });
});

describe("deliverableCountsByWorkOrder", () => {
  it("aggregates total/open per work order", () => {
    const map = deliverableCountsByWorkOrder([
      { work_order_id: "wo1", completed: true, status: "done" },
      { work_order_id: "wo1", completed: false, status: "open" },
      { work_order_id: "wo2", completed: false, status: "partial" },
    ]);
    expect(map.get("wo1")).toEqual({ total: 2, open: 1 });
    expect(map.get("wo2")).toEqual({ total: 1, open: 1 });
    // A WO absent from the (deliverable-filtered) task list has no counts —
    // pricing/allowance rows never make task_open positive.
    expect(map.get("wo3")).toBeUndefined();
  });
});

describe("mergeTaskOntoDayPlan", () => {
  it("appends without duplicates", () => {
    expect(mergeTaskOntoDayPlan(["x", "y"], "z")).toEqual(["x", "y", "z"]);
    expect(mergeTaskOntoDayPlan(["x", "y"], "x")).toEqual(["x", "y"]);
  });
});

describe("truncateTaskChipLabel", () => {
  it("truncates long labels", () => {
    const long = "A".repeat(50);
    expect(truncateTaskChipLabel(long, 20).length).toBe(20);
    expect(truncateTaskChipLabel(long, 20).endsWith("…")).toBe(true);
  });
});
