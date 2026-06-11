import type { ExpenseCategory } from "@ai-fsm/domain";
import { EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";

export function isValidMonthKey(monthKey: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return false;
  }

  const [year, month] = monthKey.split("-").map(Number);
  return Number.isInteger(year) && month >= 1 && month <= 12;
}

export function formatExpenseDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";

  const formatParts = (year: number, month: number, day: number) => {
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // If it's a Date object
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      return "Invalid Date";
    }
    return formatParts(dateInput.getFullYear(), dateInput.getMonth() + 1, dateInput.getDate());
  }

  const dateStr = String(dateInput).trim();

  // Pattern 1: YYYY-MM-DD (possibly with timezone/time, e.g. YYYY-MM-DDT00:00:00...)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return formatParts(year, month, day);
    }
  }

  // Pattern 2: Any other parsable date string (e.g. JS toString() output: "Tue Nov 04 2025 00:00:00 GMT-0500")
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return formatParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return "Invalid Date";
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
