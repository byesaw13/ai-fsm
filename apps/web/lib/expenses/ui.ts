import type { ExpenseCategory } from "@ai-fsm/domain";
import { EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";

export function isValidMonthKey(monthKey: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return false;
  }

  const [year, month] = monthKey.split("-").map(Number);
  return Number.isInteger(year) && month >= 1 && month <= 12;
}

/**
 * Format a YYYY-MM-DD expense date to a short readable label.
 * e.g. "2026-03-15" → "Mar 15, 2026"
 */
export function formatExpenseDate(dateStr: string): string {
  // Parse as local date to avoid UTC-shift issues (date-only strings are midnight UTC)
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a YYYY-MM key (e.g. "2026-03") to a display label like "March 2026".
 */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Return the current month key in YYYY-MM format, e.g. "2026-03".
 */
export function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Return a display label for a category, falling back to the raw value.
 */
export function categoryLabel(category: ExpenseCategory): string {
  return EXPENSE_CATEGORY_LABELS[category] ?? category;
}

/**
 * Build month options for the last 12 months (most recent first).
 */
export function recentMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const key = `${y}-${m}`;
    options.push({ value: key, label: formatMonthLabel(key) });
  }
  return options;
}
