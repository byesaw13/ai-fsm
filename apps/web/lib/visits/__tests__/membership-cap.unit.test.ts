import { describe, expect, it } from "vitest";
import { computeCapStatus, nextMembershipPhase } from "../membership-cap";

describe("computeCapStatus", () => {
  it("returns within_cap when no cap is set", () => {
    expect(computeCapStatus(120, null)).toBe("within_cap");
  });

  it("returns within_cap when minutes used is zero", () => {
    expect(computeCapStatus(0, 60)).toBe("within_cap");
  });

  it("returns within_cap when minutes used is below cap", () => {
    expect(computeCapStatus(45, 60)).toBe("within_cap");
  });

  it("returns cap_reached when minutes used equals cap", () => {
    expect(computeCapStatus(60, 60)).toBe("cap_reached");
  });

  it("returns cap_reached when minutes used exceeds cap", () => {
    expect(computeCapStatus(75, 60)).toBe("cap_reached");
  });
});

describe("nextMembershipPhase", () => {
  it("advances health_check to included_action", () => {
    expect(nextMembershipPhase("health_check")).toBe("included_action");
  });

  it("advances included_action to reporting", () => {
    expect(nextMembershipPhase("included_action")).toBe("reporting");
  });

  it("returns null from reporting (terminal phase)", () => {
    expect(nextMembershipPhase("reporting")).toBeNull();
  });
});
