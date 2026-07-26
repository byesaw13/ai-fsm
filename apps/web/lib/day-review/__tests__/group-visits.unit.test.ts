import { describe, it, expect } from "vitest";
import { groupVisitsByProperty } from "../group-visits";
import type { DayReviewPayload } from "../queries";

type Visit = DayReviewPayload["visits"][number];

function v(over: Partial<Visit>): Visit {
  return {
    id: "x",
    propertyId: "prop-1",
    propertyName: "68 Claremont Ave",
    clientName: "Joseph Legerstee",
    arrivalTime: "2026-07-25T13:00:00Z",
    departureTime: "2026-07-25T13:10:00Z",
    durationMinutes: 10,
    confidenceScore: 100,
    preSelected: true,
    linkedJobId: "job-1",
    classification: "job_work",
    status: "pending",
    ...over,
  };
}

describe("groupVisitsByProperty (TASK-079)", () => {
  it("collapses many same-property candidates into one row with count + total", () => {
    const groups = groupVisitsByProperty([
      v({ id: "a", durationMinutes: 34, confidenceScore: 100 }),
      v({ id: "b", durationMinutes: 12, confidenceScore: 90 }),
      v({ id: "c", durationMinutes: 4, confidenceScore: 100 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toEqual(["a", "b", "c"]);
    expect(groups[0].visitCount).toBe(3);
    expect(groups[0].totalMinutes).toBe(50);
    expect(groups[0].maxConfidence).toBe(100);
    expect(groups[0].preSelected).toBe(true);
    expect(groups[0].preSelectedClassification).toBe("job_work");
  });

  it("keeps distinct properties separate", () => {
    const groups = groupVisitsByProperty([
      v({ id: "a", propertyId: "prop-1" }),
      v({ id: "b", propertyId: "prop-2", propertyName: "12 Elm St" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("falls back to client+property when propertyId is null", () => {
    const groups = groupVisitsByProperty([
      v({ id: "a", propertyId: null }),
      v({ id: "b", propertyId: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toEqual(["a", "b"]);
  });

  it("a group is preSelected if any member is, and adopts a preselected classification", () => {
    const groups = groupVisitsByProperty([
      v({ id: "a", preSelected: false, classification: null }),
      v({ id: "b", preSelected: true, classification: "estimate" }),
    ]);
    expect(groups[0].preSelected).toBe(true);
    expect(groups[0].preSelectedClassification).toBe("estimate");
  });
});
