/**
 * Quick Action link sets for the owner Dashboard and the field My Day surface.
 *
 * Extracted from the dashboard components so the destinations are a single,
 * testable source of truth.
 *
 * The Activity Timeline (account-wide time/mileage ledger) is owner/admin-only
 * back-office and now lives under Reports (a persistent "Activity Timeline →"
 * link in the Reports header), so it is intentionally absent from both quick
 * action sets. The /app/timeline route still enforces the owner/admin guard.
 */

export interface QuickAction {
  label: string;
  /** Internal app path. Components cast this to Next's typed `Route`. */
  href: string;
  icon: string;
}

/** Owner Dashboard (`/app`) quick actions. */
export const OWNER_QUICK_ACTIONS: QuickAction[] = [
  { label: "New Estimate", href: "/app/estimates", icon: "📝" },
  { label: "New Project", href: "/app/jobs", icon: "🛠️" },
  { label: "Schedule", href: "/app/schedule", icon: "📅" },
  { label: "Invoices", href: "/app/invoices", icon: "🧾" },
  { label: "Clients", href: "/app/clients", icon: "👥" },
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];

/**
 * Field My Day (`/app/my-work`) quick actions. Rendered for technicians as well
 * as owners, so it intentionally omits the owner/admin-only Activity Timeline.
 */
export const FIELD_QUICK_ACTIONS: QuickAction[] = [
  { label: "End My Day", href: "/app/day-review", icon: "🌙" },
  { label: "New Estimate", href: "/app/estimates", icon: "📝" },
  { label: "New Project", href: "/app/jobs", icon: "🛠️" },
  { label: "Log Mileage", href: "/app/mileage", icon: "🚗" },
  { label: "Add Expense", href: "/app/expenses/new", icon: "🛒" },
  { label: "Upload Receipt", href: "/app/expenses/new", icon: "🧾" },
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];
