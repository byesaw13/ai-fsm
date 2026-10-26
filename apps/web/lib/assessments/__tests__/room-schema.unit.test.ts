import { describe, it, expect } from "vitest";
import { assessmentRoomSchema } from "../room-schema";

describe("assessmentRoomSchema", () => {
  it("accepts a room saved before openings existed", () => {
    const old = { id: "r1", name: "Hall", length_ft: 10, width_ft: 4, height_ft: null, notes: "" };
    expect(assessmentRoomSchema.parse(old)).toEqual(old);
  });

  it("keeps counted doors, windows, openings and an override", () => {
    const bath = {
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
    };
    expect(assessmentRoomSchema.parse(bath)).toEqual(bath);
  });

  it("rejects negative or fractional counts and zero-width openings", () => {
    expect(assessmentRoomSchema.safeParse({ id: "x", name: "X", door_count: -1 }).success).toBe(false);
    expect(assessmentRoomSchema.safeParse({ id: "x", name: "X", window_count: 1.5 }).success).toBe(false);
    expect(
      assessmentRoomSchema.safeParse({ id: "x", name: "X", openings: [{ label: "", width_in: 0 }] }).success,
    ).toBe(false);
  });

  it("keeps the vaulted peak, listed walls and unpainted areas (TASK-184)", () => {
    const living = {
      id: "l",
      name: "Living room",
      height_ft: 10,
      peak_height_ft: 18,
      wall_lengths: [{ label: "Stair wall", length_ft: 13 }],
      skip_areas: [{ label: "Entertainment center", width_ft: 18, height_ft: 8 }],
    };
    expect(assessmentRoomSchema.parse(living)).toEqual(living);
    expect(assessmentRoomSchema.safeParse({ id: "x", name: "X", skip_areas: [{ label: "", width_ft: 3, height_ft: 0 }] }).success).toBe(false);
  });
});
