import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATERIAL_HANDLING_PCT,
  formatReceiptDate,
  materialExpenseDescription,
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

  it("formatReceiptDate: date-only, no timezone drift", () => {
    expect(formatReceiptDate("2026-09-20")).toBe("Sep 20");
    expect(formatReceiptDate("2026-01-05T00:00:00Z")).toBe("Jan 5");
    expect(formatReceiptDate(null)).toBe("");
    expect(formatReceiptDate("garbage")).toBe("");
  });

  it("materialExpenseDescription: clean dated fallback, notes preferred", () => {
    // No SKUs + no notes → consistent, dated label.
    expect(materialExpenseDescription({ vendor_name: "Home Depot", notes: null, expense_date: "2026-09-20" }))
      .toBe("Materials — Home Depot · Sep 20");
    // Missing date → bare vendor label (no dangling separator).
    expect(materialExpenseDescription({ vendor_name: "Home Depot", notes: null }))
      .toBe("Materials — Home Depot");
    // Blank vendor → safe placeholder.
    expect(materialExpenseDescription({ vendor_name: "  ", notes: null, expense_date: "2026-09-20" }))
      .toBe("Materials — Supplier · Sep 20");
    // Notes still win when present (owner/tech intent).
    expect(materialExpenseDescription({ vendor_name: "Home Depot", notes: "2x4 lumber + screws", expense_date: "2026-09-20" }))
      .toBe("2x4 lumber + screws");
  });
});