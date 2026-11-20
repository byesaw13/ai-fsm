import { describe, it, expect } from "vitest";
import { formatCents } from "../money";

describe("formatCents", () => {
  it("formats, groups, and signs", () => {
    expect(formatCents(12345)).toBe("$123.45");
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents("250")).toBe("$2.50");
  });

  it("handles null and undefined as zero", () => {
    expect(formatCents(null)).toBe("$0.00");
    expect(formatCents(undefined)).toBe("$0.00");
  });
});