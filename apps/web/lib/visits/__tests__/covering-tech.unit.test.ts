import { describe, expect, it } from "vitest";
import { coveringTechFieldHint, coveringTechFieldLabel } from "../covering-tech";

describe("covering tech field", () => {
  it("labels the assignee as a Today user, not a dispatch seat", () => {
    expect(coveringTechFieldLabel()).toBe("Covering tech");
    expect(coveringTechFieldHint()).toMatch(/Today/);
    expect(coveringTechFieldLabel().toLowerCase()).not.toContain("dispatch");
  });
});
