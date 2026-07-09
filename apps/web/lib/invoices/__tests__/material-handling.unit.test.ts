import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATERIAL_HANDLING_PCT,
  materialHandlingCents,
  materialHandlingLineDescription,
  materialHandlingRateFromSettings,
} from "../material-handling";

describe("material-handling", () => {
  it("defaults to 15% when settings omit override", () => {
    expect(DEFAULT_MATERIAL_HANDLING_PCT).toBe(15);
    expect(materialHandlingRateFromSettings({})).toBe(0.15);
    expect(materialHandlingCents(10_000)).toBe(1500);
    expect(materialHandlingLineDescription(0.15)).toBe("Material handling (15%)");
  });

  it("reads account settings override", () => {
    expect(materialHandlingRateFromSettings({ material_handling_pct: 20 })).toBe(0.2);
    expect(materialHandlingCents(10_000, 0.2)).toBe(2000);
    expect(materialHandlingLineDescription(0.2)).toBe("Material handling (20%)");
  });
});