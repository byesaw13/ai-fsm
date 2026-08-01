import { describe, expect, it } from "vitest";

type Room = { name?: string };
type AssessmentLike = {
  rooms?: Room[] | null;
  scope_notes?: string | null;
  access_notes?: string | null;
  total_sqft?: number | null;
};

function isAssessmentFormEmpty(a: AssessmentLike | null): boolean {
  if (!a) return true;
  const rooms = Array.isArray(a.rooms) ? a.rooms : [];
  const namedRoom = rooms.some((r) => r && String(r.name ?? "").trim());
  const hasNotes =
    !!(a.scope_notes && String(a.scope_notes).trim()) ||
    !!(a.access_notes && String(a.access_notes).trim());
  return !namedRoom && !hasNotes && !a.total_sqft;
}

describe("isAssessmentFormEmpty", () => {
  it("treats null as empty", () => {
    expect(isAssessmentFormEmpty(null)).toBe(true);
  });

  it("treats blank room + no notes as empty", () => {
    expect(
      isAssessmentFormEmpty({
        rooms: [{ name: "" }],
        scope_notes: null,
        access_notes: "  ",
        total_sqft: null,
      }),
    ).toBe(true);
  });

  it("is not empty when a room is named", () => {
    expect(
      isAssessmentFormEmpty({
        rooms: [{ name: "Kitchen" }],
        scope_notes: null,
      }),
    ).toBe(false);
  });

  it("is not empty when scope notes exist", () => {
    expect(
      isAssessmentFormEmpty({
        rooms: [],
        scope_notes: "Replace siding",
      }),
    ).toBe(false);
  });
});
