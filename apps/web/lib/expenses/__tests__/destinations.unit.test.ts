import { describe, expect, it } from "vitest";
import { patchForNonJobDestination } from "../destinations";

describe("patchForNonJobDestination", () => {
  it("maps truck to vehicle category, not a job", () => {
    expect(patchForNonJobDestination("truck")).toEqual({
      allocation: "truck",
      category: "vehicle",
    });
  });

  it("keeps stock as materials", () => {
    expect(patchForNonJobDestination("stock")).toEqual({
      allocation: "stock",
      category: "materials",
    });
  });

  it("maps overhead to other", () => {
    expect(patchForNonJobDestination("overhead")).toEqual({
      allocation: "overhead",
      category: "other",
    });
  });
});
