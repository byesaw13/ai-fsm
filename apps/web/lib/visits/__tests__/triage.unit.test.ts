import { describe, expect, it } from "vitest";
import { buildVisitTriage, type TriageVisitRow } from "../triage";

const DAY = 86_400_000;
const pastISO = new Date(Date.now() - 2 * DAY).toISOString();
const futureISO = new Date(Date.now() + 7 * DAY).toISOString();
const todayNoonISO = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
})();

function visit(
  over: Partial<TriageVisitRow> & { id: string }
): TriageVisitRow {
  return {
    status: "scheduled",
    assigned_user_id: "user-1",
    scheduled_start: futureISO,
    ...over,
  } as unknown as TriageVisitRow;
}

// A deterministic fixture set covering each bucket without depending on the
// wall-clock time of day (cancelled/completed are never overdue; today uses a
// completed visit so it can't drift into the overdue bucket).
const visits: TriageVisitRow[] = [
  visit({ id: "a", status: "scheduled", assigned_user_id: null, scheduled_start: futureISO }),
  visit({ id: "b", status: "scheduled", scheduled_start: pastISO }),
  visit({ id: "c", status: "in_progress", scheduled_start: futureISO }),
  visit({ id: "d", status: "completed", scheduled_start: pastISO }),
  visit({ id: "e", status: "completed", scheduled_start: todayNoonISO }),
  visit({ id: "f", status: "cancelled", assigned_user_id: null, scheduled_start: pastISO }),
];

describe("buildVisitTriage", () => {
  const triage = buildVisitTriage(visits);

  it("counts the total", () => {
    expect(triage.total).toBe(6);
  });

  it("flags only unassigned, non-terminal visits as needs-assignment", () => {
    expect(triage.unassigned.map((v) => v.id)).toEqual(["a"]); // not f (cancelled)
    expect(triage.metrics.needsAssignment).toBe(1);
  });

  it("puts past scheduled visits in the overdue bucket", () => {
    expect(triage.overdue.map((v) => v.id)).toEqual(["b"]);
    expect(triage.metrics.overdue).toBe(1);
  });

  it("counts active (arrived/in_progress) visits", () => {
    expect(triage.metrics.activeNow).toBe(1); // c
  });

  it("counts visits scheduled for today", () => {
    expect(triage.metrics.today).toBe(1); // e
  });

  it("groups the remainder by status order, excluding overdue", () => {
    expect(triage.groups.map((g) => g.status)).toEqual([
      "in_progress",
      "scheduled",
      "completed",
      "cancelled",
    ]);
    const scheduled = triage.groups.find((g) => g.status === "scheduled");
    expect(scheduled?.visits.map((v) => v.id)).toEqual(["a"]); // b excluded (overdue)
    const completed = triage.groups.find((g) => g.status === "completed");
    expect(completed?.visits.map((v) => v.id)).toEqual(["d", "e"]);
  });

  it("drops empty groups", () => {
    expect(triage.groups.some((g) => g.status === "arrived")).toBe(false);
  });

  it("returns no groups and zero metrics for an empty list", () => {
    const empty = buildVisitTriage([]);
    expect(empty.total).toBe(0);
    expect(empty.groups).toEqual([]);
    expect(empty.metrics).toEqual({
      needsAssignment: 0,
      today: 0,
      activeNow: 0,
      overdue: 0,
    });
  });
});
