import { describe, it, expect } from "vitest";
import { formatCents, money, durationMinutes, todayIso } from "../money.js";

describe("money helpers", () => {
  it("formats cents as USD", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(null)).toBe("$0.00");
  });

  it("money() returns both raw and formatted", () => {
    expect(money(5000)).toEqual({ cents: 5000, formatted: "$50.00" });
    expect(money(undefined)).toEqual({ cents: 0, formatted: "$0.00" });
  });

  it("durationMinutes computes whole minutes or null for open entries", () => {
    expect(durationMinutes("2026-06-20T13:00:00Z", "2026-06-20T15:30:00Z")).toBe(150);
    expect(durationMinutes("2026-06-20T13:00:00Z", null)).toBeNull();
    expect(durationMinutes(null, "2026-06-20T15:00:00Z")).toBeNull();
  });

  it("todayIso produces a YYYY-MM-DD string", () => {
    expect(todayIso(new Date(2026, 5, 9))).toBe("2026-06-09");
  });
});
