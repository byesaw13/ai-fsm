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

  it("flags a geocoded street address inside the learned home fence (TASK-148)", () => {
    const home = { latitude: 43.2, longitude: -71.5 };
    expect(
      isPrivateLocation(null, "8 Bus Rd", {
        latitude: 43.2002,
        longitude: -71.5,
        home,
      }),
    ).toBe(true);
  });

  it("does not flag a customer stop outside the home fence", () => {
    expect(
      isPrivateLocation(null, "4 Ash", {
        latitude: 43.21,
        longitude: -71.5,
        home: { latitude: 43.2, longitude: -71.5 },
      }),
    ).toBe(false);
  });
});