import { describe, it, expect } from "vitest";
import { isPrivateLocation } from "./location";

describe("isPrivateLocation (TASK-046)", () => {
  it("flags HA home zone", () => {
    expect(isPrivateLocation("home", null)).toBe(true);
    expect(isPrivateLocation(null, "Home")).toBe(true);
  });

  it("flags private zone", () => {
    expect(isPrivateLocation("private", null)).toBe(true);
  });

  it("allows job and supply stops", () => {
    expect(isPrivateLocation("shop", "Home Depot")).toBe(false);
    expect(isPrivateLocation(null, "123 Main St")).toBe(false);
  });
});