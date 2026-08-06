import { describe, expect, it } from "vitest";
import { buildVisitTimeline } from "@ai-fsm/domain";
import { groupActivitiesByVisitId } from "../load-visit-timeline";

describe("groupActivitiesByVisitId", () => {
  it("groups activity rows by entity_id", () => {
    const grouped = groupActivitiesByVisitId([
      {
        id: "a1",
        entity_id: "v1",
        activity_type: "job_work",
        started_at: "2026-08-05T12:00:00.000Z",
        ended_at: "2026-08-05T13:00:00.000Z",
        note: null,
      },
      {
        id: "a2",
        entity_id: "v2",
        activity_type: "travel",
        started_at: "2026-08-05T11:00:00.000Z",
        ended_at: null,
        note: "to site",
      },
      {
        id: "a3",
        entity_id: "v1",
        activity_type: "material_run",
        started_at: "2026-08-05T14:00:00.000Z",
        ended_at: "2026-08-05T14:30:00.000Z",
        note: null,
      },
    ]);
    expect(grouped.v1).toHaveLength(2);
    expect(grouped.v2).toHaveLength(1);
    expect(grouped.v2[0].label).toBe("to site");
  });
});

describe("buildVisitTimeline integration smoke", () => {
  it("composes with grouped activities", () => {
    const grouped = groupActivitiesByVisitId([
      {
        id: "a1",
        entity_id: "v1",
        activity_type: "job_work",
        started_at: "2026-08-05T12:45:00.000Z",
        ended_at: null,
        note: null,
      },
    ]);
    const events = buildVisitTimeline({
      visit: {
        id: "v1",
        scheduled_start: "2026-08-05T12:00:00.000Z",
        arrived_at: "2026-08-05T12:40:00.000Z",
        completed_at: null,
      },
      activities: grouped.v1,
    });
    expect(events.some((e) => e.is_open)).toBe(true);
    expect(events.map((e) => e.kind)).toEqual(["scheduled", "arrived", "activity"]);
  });
});
