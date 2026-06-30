import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  expenseCategorySchema,
} from "@ai-fsm/domain";
import { isValidCategory } from "../math";
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
