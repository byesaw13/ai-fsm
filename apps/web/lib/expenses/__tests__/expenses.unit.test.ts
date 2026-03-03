import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  expenseCategorySchema,
} from "@ai-fsm/domain";
import {
  parseDollarsToCents,
  formatCentsToDollars,
  isValidCategory,
} from "../math";
import {
  canManageExpenses,
  canViewExpenses,
  canDeleteRecords,
} from "../../auth/permissions";

// ===
// Category validation
// ===

describe("expenseCategorySchema", () => {
  it("accepts all valid categories", () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(() => expenseCategorySchema.parse(cat)).not.toThrow();
    }
  });

  it("rejects freeform categories", () => {
    expect(() => expenseCategorySchema.parse("custom_category")).toThrow();
    expect(() => expenseCategorySchema.parse("")).toThrow();
    expect(() => expenseCategorySchema.parse("MATERIALS")).toThrow();
  });

  it("has 12 locked categories", () => {
    expect(EXPENSE_CATEGORIES).toHaveLength(12);
  });

  it("includes core field service categories", () => {
    expect(EXPENSE_CATEGORIES).toContain("materials");
    expect(EXPENSE_CATEGORIES).toContain("fuel");
    expect(EXPENSE_CATEGORIES).toContain("subcontractors");
    expect(EXPENSE_CATEGORIES).toContain("tools");
  });
});

describe("EXPENSE_CATEGORY_LABELS", () => {
  it("has a label for every category", () => {
    for (const cat of EXPENSE_CATEGORIES) {
      expect(EXPENSE_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});

describe("isValidCategory", () => {
  it("returns true for valid categories", () => {
    expect(isValidCategory("materials")).toBe(true);
    expect(isValidCategory("fuel")).toBe(true);
    expect(isValidCategory("other")).toBe(true);
  });

  it("returns false for invalid categories", () => {
    expect(isValidCategory("random")).toBe(false);
    expect(isValidCategory("")).toBe(false);
    expect(isValidCategory("FUEL")).toBe(false);
  });
});

// ===
// Money math
// ===

describe("parseDollarsToCents", () => {
  it("converts dollar string to cents", () => {
    expect(parseDollarsToCents("12.50")).toBe(1250);
    expect(parseDollarsToCents("100")).toBe(10000);
    expect(parseDollarsToCents("0.01")).toBe(1);
  });

  it("rounds to nearest cent", () => {
    // 1.005 in IEEE-754 is stored as ~1.00499... so Math.round gives 100
    expect(parseDollarsToCents("1.005")).toBe(100);
    expect(parseDollarsToCents("1.004")).toBe(100);
    // Use a value that genuinely rounds up
    expect(parseDollarsToCents("1.006")).toBe(101);
  });

  it("returns 0 for empty string", () => {
    expect(parseDollarsToCents("")).toBe(0);
  });

  it("returns 0 for non-numeric input", () => {
    expect(parseDollarsToCents("abc")).toBe(0);
    expect(parseDollarsToCents("$10")).toBe(0);
  });

  it("returns 0 for negative values", () => {
    expect(parseDollarsToCents("-5")).toBe(0);
  });
});

describe("formatCentsToDollars", () => {
  it("formats cents to dollar string with 2 decimal places", () => {
    expect(formatCentsToDollars(1250)).toBe("$12.50");
    expect(formatCentsToDollars(10000)).toBe("$100.00");
    expect(formatCentsToDollars(1)).toBe("$0.01");
    expect(formatCentsToDollars(0)).toBe("$0.00");
  });
});

// ===
// Role-based permissions for expenses
// ===

describe("expense permissions", () => {
  it("canViewExpenses: all roles can view", () => {
    expect(canViewExpenses("owner")).toBe(true);
    expect(canViewExpenses("admin")).toBe(true);
    expect(canViewExpenses("tech")).toBe(true);
  });

  it("canManageExpenses: owner and admin only", () => {
    expect(canManageExpenses("owner")).toBe(true);
    expect(canManageExpenses("admin")).toBe(true);
    expect(canManageExpenses("tech")).toBe(false);
  });

  it("canDeleteRecords: owner only", () => {
    expect(canDeleteRecords("owner")).toBe(true);
    expect(canDeleteRecords("admin")).toBe(false);
    expect(canDeleteRecords("tech")).toBe(false);
  });
});
