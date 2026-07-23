import { describe, expect, it } from "vitest";
import {
  findUnplannedOpenTasks,
  groupPlannedTasksByVisit,
  mergeTaskOntoDayPlan,
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
