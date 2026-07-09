import { describe, expect, it } from "vitest";
import {
  formatLineQuantityDisplay,
  formatLineQuantityInput,
  parseLineQuantity,
  snapLineQuantityToQuarter,
} from "../quantity";

describe("quantity", () => {
  it("parses pg numeric strings and never returns blank input", () => {
    expect(parseLineQuantity("25.0000")).toBe(25);
    expect(parseLineQuantity("6.75")).toBe(6.75);
    expect(formatLineQuantityInput("4.0000")).toBe("4");
    expect(formatLineQuantityInput(null)).toBe("1");
    expect(formatLineQuantityDisplay(undefined)).toBe("1");
  });

  it("snaps to quarter increments (min 0.25)", () => {
    expect(snapLineQuantityToQuarter(1)).toBe(1);
    expect(snapLineQuantityToQuarter(25)).toBe(25);
    expect(snapLineQuantityToQuarter(0.1)).toBe(0.25);
    expect(snapLineQuantityToQuarter(0.37)).toBe(0.25);
    expect(snapLineQuantityToQuarter(0.38)).toBe(0.5);
    expect(snapLineQuantityToQuarter(0.62)).toBe(0.5);
    expect(snapLineQuantityToQuarter(0.63)).toBe(0.75);
    expect(snapLineQuantityToQuarter(1.12)).toBe(1);
    expect(snapLineQuantityToQuarter(1.13)).toBe(1.25);
    expect(formatLineQuantityInput(2.5)).toBe("2.5");
    expect(formatLineQuantityDisplay(0.75)).toBe("0.75");
  });
});