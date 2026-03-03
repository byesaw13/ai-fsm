import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";
import type { ExpenseCategory } from "@ai-fsm/domain";

export { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS };
export type { ExpenseCategory };

/**
 * Parse a dollar string (e.g. "12.50") to cents.
 * Returns 0 for non-numeric or empty input.
 */
export function parseDollarsToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

/**
 * Format cents to a display dollar string (e.g. "$12.50").
 */
export function formatCentsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Check that a category value is in the locked set.
 */
export function isValidCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}
