import { describe, it, expect } from "vitest";
import { computeAssessmentRoomGeometry } from "../painting";
import {
  buildAssessmentJobDescription,
  normalizeAssessmentRoom,
  normalizeAssessmentRooms,
  type AssessmentRoom,
} from "../assessment-summary";

function room(overrides: Partial<AssessmentRoom>): AssessmentRoom {
  return { id: "r", name: "Room", length_ft: null, width_ft: null, height_ft: null, notes: "", ...overrides };
}

// Reference rooms from the owner's four-room walkthrough (TASK-178).
const ROOM_1 = room({ name: "Room 1", length_ft: 10, width_ft: 10, door_count: 1, window_count: 2 });
const BATHROOM = room({
  name: "Bathroom",
  length_ft: 12,
  width_ft: 8,
  door_count: 1,
  window_count: 1,
  openings: [{ label: "Closet door", width_in: 20 }],
});

describe("computeAssessmentRoomGeometry", () => {
  it("measures floor, ceiling and perimeter from length and width", () => {
    const g = computeAssessmentRoomGeometry(ROOM_1);
    expect(g.floor_sqft).toEqual({ value: 100, basis: "measured" });
    expect(g.ceiling_sqft).toEqual({ value: 100, basis: "measured" });
    expect(g.perimeter_lf).toEqual({ value: 40, basis: "measured" });
  });

  it("leaves walls unknown when no height was taken", () => {
    const g = computeAssessmentRoomGeometry(ROOM_1);
    expect(g.gross_wall_sqft).toEqual({ value: null, basis: "unknown" });
    expect(g.net_wall_sqft).toEqual({ value: null, basis: "unknown" });
  });

  it("reference bathroom: 96 sq ft floor and ceiling, 40 LF perimeter, walls unknown", () => {
    const g = computeAssessmentRoomGeometry(BATHROOM);
    expect(g.floor_sqft.value).toBe(96);
    expect(g.ceiling_sqft.value).toBe(96);
    expect(g.perimeter_lf.value).toBe(40);
    expect(g.gross_wall_sqft.basis).toBe("unknown");
  });

  it("deducts standard doors, windows and measured openings from baseboard", () => {
    // 40 LF − 3 LF (one standard door) − 20 in closet opening
    const g = computeAssessmentRoomGeometry(BATHROOM);
    expect(g.baseboard_lf.basis).toBe("assumed");
    expect(g.baseboard_lf.value).toBeCloseTo(40 - 3 - 20 / 12, 5);
    expect(computeAssessmentRoomGeometry(ROOM_1).baseboard_lf.value).toBe(37);
  });

  it("8 × 10 × 8 room: 288 gross, standard openings deducted, net labeled assumed", () => {
    const g = computeAssessmentRoomGeometry(
      room({ length_ft: 10, width_ft: 8, height_ft: 8, door_count: 1, window_count: 2 }),
    );
    expect(g.gross_wall_sqft).toEqual({ value: 288, basis: "measured" });
    expect(g.opening_deduction_sqft).toEqual({ value: 50, basis: "assumed" });
    expect(g.net_wall_sqft).toEqual({ value: 238, basis: "assumed" });
  });

  it("deducts a measured opening at standard door height", () => {
    const g = computeAssessmentRoomGeometry(
      room({ length_ft: 12, width_ft: 8, height_ft: 8, door_count: 0, window_count: 0, openings: [{ label: "Closet", width_in: 24 }] }),
    );
    // 24 in wide × 80 in tall = 2 ft × 6.667 ft
    expect(g.opening_deduction_sqft.value).toBeCloseTo(2 * (80 / 12), 5);
  });

  it("reports openings unknown when doors or windows were not counted, never a net figure", () => {
    const g = computeAssessmentRoomGeometry(room({ length_ft: 10, width_ft: 8, height_ft: 8 }));
    expect(g.gross_wall_sqft.value).toBe(288);
    expect(g.opening_deduction_sqft).toEqual({ value: null, basis: "unknown" });
    expect(g.net_wall_sqft).toEqual({ value: null, basis: "unknown" });
    expect(g.baseboard_lf).toEqual({ value: null, basis: "unknown" });
    expect(g.openings_known).toBe(false);
  });

  it("treats explicit zero doors and windows as measured", () => {
    const g = computeAssessmentRoomGeometry(
      room({ length_ft: 10, width_ft: 8, height_ft: 8, door_count: 0, window_count: 0 }),
    );
    expect(g.opening_deduction_sqft).toEqual({ value: 0, basis: "measured" });
    expect(g.net_wall_sqft).toEqual({ value: 288, basis: "measured" });
    expect(g.baseboard_lf).toEqual({ value: 36, basis: "measured" });
  });

  it("an owner override replaces the net wall area", () => {
    const g = computeAssessmentRoomGeometry(room({ length_ft: 10, width_ft: 8, wall_sqft_override: 243 }));
    expect(g.net_wall_sqft).toEqual({ value: 243, basis: "override" });
    expect(g.gross_wall_sqft.basis).toBe("unknown");
  });

  it("treats half-typed form values as not counted", () => {
    const g = computeAssessmentRoomGeometry(
      room({ length_ft: 10, width_ft: 8, height_ft: 8, door_count: -1, window_count: 1.5, wall_sqft_override: -5, openings: [{ label: "", width_in: 0 }] }),
    );
    expect(g.openings_known).toBe(false);
    expect(g.net_wall_sqft).toEqual({ value: null, basis: "unknown" });
  });

  it("returns everything unknown for a room with no measurements", () => {
    const g = computeAssessmentRoomGeometry(room({}));
    expect(g.floor_sqft.basis).toBe("unknown");
    expect(g.perimeter_lf.basis).toBe("unknown");
    expect(g.baseboard_lf.basis).toBe("unknown");
  });
});

describe("normalizeAssessmentRoom", () => {
  it("keeps entered opening fields", () => {
    expect(
      normalizeAssessmentRoom({
        id: "b",
        name: "Bathroom",
        length_ft: 12,
        width_ft: 8,
        height_ft: null,
        notes: "",
        door_count: 1,
        window_count: 1,
        openings: [{ label: "Closet door", width_in: 20 }],
        wall_sqft_override: 150,
      }),
    ).toEqual({
      id: "b",
      name: "Bathroom",
      length_ft: 12,
      width_ft: 8,
      height_ft: null,
      notes: "",
      door_count: 1,
      window_count: 1,
      openings: [{ label: "Closet door", width_in: 20 }],
      wall_sqft_override: 150,
    });
  });

  it("leaves a room saved before openings existed exactly as it was", () => {
    const old = { id: "r1", name: "Hall", length_ft: 10, width_ft: 4, height_ft: 8, notes: "scuffs" };
    const out = normalizeAssessmentRoom(old);
    expect(out).toEqual(old);
    expect(Object.keys(out).sort()).toEqual(Object.keys(old).sort());
  });

  it("parses numeric strings and drops invalid opening values", () => {
    const out = normalizeAssessmentRoom({
      id: "x",
      name: "X",
      length_ft: "12",
      door_count: "2",
      window_count: -1,
      openings: [{ label: "ok", width_in: 30 }, { label: "bad", width_in: 0 }, null, "junk"],
      wall_sqft_override: "nope",
    });
    expect(out.length_ft).toBe(12);
    expect(out.door_count).toBe(2);
    expect(out.window_count).toBeUndefined();
    expect(out.openings).toEqual([{ label: "ok", width_in: 30 }]);
    expect(out.wall_sqft_override).toBeUndefined();
  });

  it("normalizes a list and tolerates non-arrays", () => {
    expect(normalizeAssessmentRooms(null)).toEqual([]);
    expect(normalizeAssessmentRooms([{ id: "a" }])).toEqual([
      { id: "a", name: "", length_ft: null, width_ft: null, height_ft: null, notes: "" },
    ]);
  });
});

describe("job description openings", () => {
  it("names counted doors, windows and measured openings", () => {
    const text = buildAssessmentJobDescription({ rooms: [BATHROOM] });
    expect(text).toContain("Bathroom — 12 x 8 ft (96 sqft) — 1 door, 1 window, Closet door 20 in wide");
  });

  it("says nothing about openings that were not counted", () => {
    const text = buildAssessmentJobDescription({ rooms: [room({ name: "Hall", length_ft: 10, width_ft: 4 })] });
    expect(text).not.toMatch(/door|window/);
  });
});
