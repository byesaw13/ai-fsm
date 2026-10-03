import { describe, expect, it } from "vitest";
import { areaCaptureStatus, areaStatusLabel, assessmentAreaProgress } from "../area-status";

const room = {
  name: "Kitchen",
  length_ft: null as number | null,
  width_ft: null as number | null,
  height_ft: null as number | null,
  notes: "",
};

describe("area capture status", () => {
  it("treats a blank name as not started", () => {
    expect(areaCaptureStatus({ ...room, name: "  " })).toBe("not_started");
    expect(areaStatusLabel("not_started")).toBe("Not started");
  });

  it("asks for confirmation when the area is only named", () => {
    expect(areaCaptureStatus(room)).toBe("needs_confirmation");
  });

  it("counts a note or a measurement as captured", () => {
    expect(areaCaptureStatus({ ...room, notes: "peeling paint" })).toBe("captured");
    expect(areaCaptureStatus({ ...room, length_ft: 10, width_ft: 12 })).toBe("captured");
  });

  it("summarizes the walkthrough", () => {
    expect(assessmentAreaProgress([
      room,
      { ...room, name: "", notes: "" },
      { ...room, name: "Bath", notes: "fan" },
    ])).toEqual({ captured: 1, needsConfirmation: 1, notStarted: 1 });
  });
});
