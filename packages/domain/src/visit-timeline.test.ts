import { describe, expect, it } from "vitest";
import { buildDayVisitTimelines, buildVisitTimeline } from "./visit-timeline";

const visitBase = {
  id: "v1",
  scheduled_start: "2026-08-05T12:00:00.000Z",
  scheduled_end: "2026-08-05T16:00:00.000Z",
  arrived_at: "2026-08-05T12:41:00.000Z",
  completed_at: "2026-08-05T16:10:00.000Z",
};

describe("buildVisitTimeline", () => {
  it("orders lifecycle and activities by at, with kind tie-break", () => {
    const events = buildVisitTimeline({
      visit: visitBase,
      activities: [
        {
          id: "a1",
          activity_type: "job_work",
          started_at: "2026-08-05T12:45:00.000Z",
          ended_at: "2026-08-05T14:00:00.000Z",
        },
        {
          id: "a2",
          activity_type: "material_run",
          started_at: "2026-08-05T14:12:00.000Z",
          ended_at: "2026-08-05T14:57:00.000Z",
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual([
      "scheduled",
      "arrived",
      "activity",
      "activity",
      "completed",
    ]);
    expect(events[2].title).toBe("Job Work");
    expect(events[3].title).toBe("Material Run");
  });

  it("marks open activities and null ended_at", () => {
    const events = buildVisitTimeline({
      visit: { ...visitBase, completed_at: null },
      activities: [
        {
          id: "a1",
          activity_type: "job_work",
          started_at: "2026-08-05T12:45:00.000Z",
          ended_at: null,
        },
      ],
    });
    const open = events.find((e) => e.kind === "activity");
    expect(open?.is_open).toBe(true);
    expect(open?.ended_at).toBeNull();
    expect(open?.subtitle).toMatch(/–$/);
  });

  it("returns lifecycle-only when no activities", () => {
    const events = buildVisitTimeline({
      visit: visitBase,
      activities: [],
    });
    expect(events.map((e) => e.kind)).toEqual(["scheduled", "arrived", "completed"]);
  });

  it("skips voided activities", () => {
    const events = buildVisitTimeline({
      visit: { id: "v1", scheduled_start: "2026-08-05T12:00:00.000Z", arrived_at: null, completed_at: null },
      activities: [
        {
          id: "a1",
          activity_type: "admin",
          started_at: "2026-08-05T12:10:00.000Z",
          ended_at: "2026-08-05T12:20:00.000Z",
          voided_at: "2026-08-05T12:21:00.000Z",
        },
      ],
    });
    expect(events.filter((e) => e.kind === "activity")).toHaveLength(0);
  });

  it("tie-breaks same timestamp by kind rank", () => {
    const t = "2026-08-05T13:00:00.000Z";
    const events = buildVisitTimeline({
      visit: {
        id: "v1",
        scheduled_start: t,
        arrived_at: t,
        completed_at: t,
      },
      activities: [
        {
          id: "a1",
          activity_type: "travel",
          started_at: t,
          ended_at: t,
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual([
      "scheduled",
      "arrived",
      "activity",
      "completed",
    ]);
  });
});

describe("buildDayVisitTimelines", () => {
  it("preserves visit order and maps activities per visit", () => {
    const rows = buildDayVisitTimelines({
      visits: [
        { id: "v1", scheduled_start: "2026-08-05T12:00:00.000Z", arrived_at: null, completed_at: null },
        { id: "v2", scheduled_start: "2026-08-05T14:00:00.000Z", arrived_at: null, completed_at: null },
      ],
      activitiesByVisitId: {
        v2: [
          {
            id: "a1",
            activity_type: "estimate_visit",
            started_at: "2026-08-05T14:05:00.000Z",
            ended_at: "2026-08-05T14:30:00.000Z",
          },
        ],
      },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].visitId).toBe("v1");
    expect(rows[0].events.filter((e) => e.kind === "activity")).toHaveLength(0);
    expect(rows[1].events.filter((e) => e.kind === "activity")).toHaveLength(1);
  });
});
