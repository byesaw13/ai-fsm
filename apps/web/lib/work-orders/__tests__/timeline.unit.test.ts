import { describe, it, expect } from "vitest";
import { buildWorkOrderTimeline } from "../timeline";

describe("buildWorkOrderTimeline", () => {
  it("orders story chronologically with visits and completion", () => {
    const entries = buildWorkOrderTimeline({
      estimateAcceptedAt: "2026-07-02T09:00:00Z",
      woCreatedAt: "2026-07-02T09:05:00Z",
      woCompletedAt: "2026-07-14T16:00:00Z",
      visits: [
        {
          id: "v1",
          scheduled_start: "2026-07-09T13:00:00Z",
          arrived_at: "2026-07-09T13:02:00Z",
          completed_at: "2026-07-09T18:00:00Z",
          status: "completed",
          tech_notes: "Vanity removed",
        },
      ],
      reminders: [{ visit_id: "v1", created_at: "2026-07-08T12:00:00Z" }],
      workflowEvents: [],
    });

    expect(entries.map((e) => e.title)).toEqual([
      "Estimate accepted",
      "Work order created",
      "Appointment reminder sent",
      "Visit #1 scheduled",
      "Visit #1 started",
      "Visit #1",
      "Work order completed",
    ]);
    expect(entries.find((e) => e.id === "v1-log")?.subtitle).toBe("Vanity removed");
  });
});