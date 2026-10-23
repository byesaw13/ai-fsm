import { describe, it, expect } from "vitest";
import { computeAssessmentRoomGeometry, type AssessmentRoom } from "@ai-fsm/domain";
import { roomGeometryLines } from "../room-geometry-display";

function lines(overrides: Partial<AssessmentRoom>): string[] {
  return roomGeometryLines(
    computeAssessmentRoomGeometry({ id: "r", name: "R", length_ft: null, width_ft: null, height_ft: null, notes: "", ...overrides }),
  );
}

describe("roomGeometryLines", () => {
  it("shows gross, deductions and net together, marking standard sizes as assumed", () => {
    expect(lines({ length_ft: 10, width_ft: 8, height_ft: 8, door_count: 1, window_count: 2 })).toEqual([
      "Floor / ceiling 80 sq ft",
      "Walls 288 gross − 50 openings = 238 sq ft (standard sizes assumed)",
      "Baseboard 33 LF (doorways skipped)",
    ]);
  });

  it("never presents gross as net when openings were not counted", () => {
    expect(lines({ length_ft: 10, width_ft: 8, height_ft: 8 })).toEqual([
      "Floor / ceiling 80 sq ft",
      "Walls 288 sq ft gross · doors and windows not counted, nothing deducted",
      "Perimeter 36 LF · count doors for baseboard",
    ]);
  });

  it("asks for a height when walls cannot be calculated (reference bathroom)", () => {
    expect(
      lines({ length_ft: 12, width_ft: 8, door_count: 1, window_count: 1, openings: [{ label: "Closet", width_in: 20 }] }),
    ).toEqual(["Floor / ceiling 96 sq ft", "Walls: add a height to calculate", "Baseboard 35.3 LF (doorways skipped)"]);
  });

  it("labels an override", () => {
    expect(lines({ wall_sqft_override: 243 })).toEqual(["Walls 243 sq ft (your override)"]);
  });

  it("shows nothing for an unmeasured room", () => {
    expect(lines({})).toEqual([]);
  });
});
