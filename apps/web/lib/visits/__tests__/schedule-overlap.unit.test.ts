import { describe, expect, it } from "vitest";
import { assigneeOverlap, overlapOverrideApplies, scheduleConflictMessage, scheduleSlotLabel, type ScheduleSlot } from "../schedule-overlap";

const smith: ScheduleSlot = {
  id: "smith",
  assignedUserId: "tech-1",
  start: "2026-10-02T13:00:00.000Z",
  end: "2026-10-02T15:00:00.000Z",
  status: "scheduled",
  label: "Smith Residence · 18 Main St",
};

describe("assigneeOverlap", () => {
  it("returns the visit that shares the assignee and the window", () => {
    const hit = assigneeOverlap(
      {
        id: "moved",
        assignedUserId: "tech-1",
        start: "2026-10-02T14:00:00.000Z",
        end: "2026-10-02T16:00:00.000Z",
      },
      [smith],
    );
    expect(hit?.id).toBe("smith");
    expect(scheduleConflictMessage(smith)).toContain("Smith Residence · 18 Main St is already booked");
  });

  it("ignores a different technician, a cancelled visit, and the visit being moved", () => {
    expect(
      assigneeOverlap(
        {
          id: "moved",
          assignedUserId: "tech-2",
          start: smith.start,
          end: smith.end,
        },
        [smith],
      ),
    ).toBeNull();
    expect(
      assigneeOverlap(
        { id: "moved", assignedUserId: "tech-1", start: smith.start, end: smith.end },
        [{ ...smith, status: "cancelled" }],
      ),
    ).toBeNull();
    expect(
      assigneeOverlap(
        { id: "smith", assignedUserId: "tech-1", start: smith.start, end: smith.end },
        [smith],
      ),
    ).toBeNull();
  });

  it("does not warn when nobody is assigned", () => {
    expect(
      assigneeOverlap(
        { id: "moved", assignedUserId: null, start: smith.start, end: smith.end },
        [smith],
      ),
    ).toBeNull();
  });
});

describe("overlapOverrideApplies", () => {
  it("honors Move anyway only for the interval that was rejected", () => {
    const rejected = { start: "2026-10-02T13:00:00.000Z", end: "2026-10-02T15:00:00.000Z" };
    expect(overlapOverrideApplies(rejected, rejected)).toBe(true);
    expect(overlapOverrideApplies(
      { start: "2026-10-02T16:00:00.000Z", end: "2026-10-02T17:00:00.000Z" },
      rejected,
    )).toBe(false);
    expect(overlapOverrideApplies(rejected, null)).toBe(false);
  });
});

describe("scheduleSlotLabel", () => {
  it("includes the address when the destination is known", () => {
    expect(scheduleSlotLabel("Smith", "18 Main St")).toBe("Smith · 18 Main St");
    expect(scheduleSlotLabel(null, null)).toBe("Another visit");
  });
});
