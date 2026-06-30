import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";
import type { ExpenseCategory } from "@ai-fsm/domain";

export { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS };
export type { ExpenseCategory };

export { formatCentsToDollars, parseDollarsToCents } from "@ai-fsm/money";

/**
 * Check that a category value is in the locked set.
 */
export function isValidCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}