import { describe, expect, it } from "vitest";
import { formatBadgeCount } from "../counts";

describe("formatBadgeCount", () => {
  it("hides zero", () => {
    expect(formatBadgeCount(0)).toBeNull();
  });

  it("shows small integers", () => {
    expect(formatBadgeCount(1)).toBe("1");
    expect(formatBadgeCount(42)).toBe("42");
  });

  it("caps at 99+", () => {
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
    expect(formatBadgeCount(500)).toBe("99+");
  });
});
