import { describe, expect, it } from "vitest";
import {
  detectTaskScheduleMismatch,
  pickAssessmentVisitId,
  pickNextExecutionVisit,
  type WorkOrderBoardRow,
} from "../project-launch";

describe("detectTaskScheduleMismatch", () => {
  const base = (partial: Partial<WorkOrderBoardRow> & Pick<WorkOrderBoardRow, "id" | "title">): WorkOrderBoardRow => ({
    status: "ready",
    visit_count: 0,
    active_visit_count: 0,
    task_total: 0,
    task_open: 0,
    ...partial,
  });

  it("flags calendar WO with visits but no tasks when another WO has open tasks", () => {
    const m = detectTaskScheduleMismatch([
      base({ id: "empty", title: "Remaining work", visit_count: 7, task_open: 0, task_total: 0 }),
      base({ id: "rich", title: "Specialty Expansion", visit_count: 0, task_open: 17, task_total: 17 }),
    ]);
    expect(m).not.toBeNull();
    expect(m!.calendarWo.id).toBe("empty");
    expect(m!.tasksWo.id).toBe("rich");
    expect(m!.message).toMatch(/open work lives/i);
  });

  it("returns null when calendar WO has open tasks", () => {
    expect(
      detectTaskScheduleMismatch([
        base({ id: "a", title: "A", visit_count: 3, task_open: 5, task_total: 10 }),
        base({ id: "b", title: "B", visit_count: 0, task_open: 2, task_total: 2 }),
      ]),
    ).toBeNull();
  });

  it("returns null with a single work order", () => {
    expect(
      detectTaskScheduleMismatch([
        base({ id: "only", title: "Only", visit_count: 2, task_open: 0 }),
      ]),
    ).toBeNull();
  });
});

describe("pickAssessmentVisitId", () => {
  it("prefers open site_visit over completed", () => {
    const id = pickAssessmentVisitId([
      {
        id: "old",
        visit_type: "site_visit",
        status: "completed",
        scheduled_start: "2026-06-01",
      },
      {
        id: "open",
        visit_type: "site_visit",
        status: "scheduled",
        scheduled_start: "2026-07-01",
      },
      {
        id: "work",
        visit_type: "standard",
        status: "scheduled",
        scheduled_start: "2026-07-02",
      },
    ]);
    expect(id).toBe("open");
  });

  it("falls back to latest completed assessment", () => {
    const id = pickAssessmentVisitId([
      {
        id: "a",
        visit_type: "site_visit",
        status: "completed",
        scheduled_start: "2026-06-01",
      },
      {
        id: "b",
        visit_type: "site_visit",
        status: "completed",
        scheduled_start: "2026-06-12",
      },
    ]);
    expect(id).toBe("b");
  });
});

describe("pickNextExecutionVisit", () => {
  it("picks earliest open execution visit", () => {
    const n = pickNextExecutionVisit([
      {
        id: "done",
        visit_type: "standard",
        status: "completed",
        scheduled_start: "2026-07-20T12:00:00Z",
      },
      {
        id: "later",
        visit_type: "standard",
        status: "scheduled",
        scheduled_start: "2026-07-24T12:00:00Z",
      },
      {
        id: "soon",
        visit_type: "standard",
        status: "scheduled",
        scheduled_start: "2026-07-23T12:00:00Z",
      },
    ]);
    expect(n?.id).toBe("soon");
  });
});
