/**
 * Quick Action link sets for the owner Dashboard and the field My Day surface.
 *
 * Extracted from the dashboard components so the destinations are a single,
 * testable source of truth. The Activity Timeline (auto time tracker) lives only
 * here as a persistent entry point — the dashboard's "Label Captured Locations"
 * action is count-gated and disappears when there is nothing pending, so without
 * a Quick Action the timeline would be unreachable from the UI.
 *
 * The Activity Timeline edits the account-wide time ledger (entries keyed by
 * account, not by user), so it is **owner/admin-only**: it belongs in
 * OWNER_QUICK_ACTIONS but not in FIELD_QUICK_ACTIONS, which the technician My Day
 * surface also renders. The /app/timeline route enforces this too.
 */

export interface QuickAction {
  label: string;
  /** Internal app path. Components cast this to Next's typed `Route`. */
  href: string;
  icon: string;
}

/** Persistent link to the Activity Timeline (passive location capture → ledger). */
export const ACTIVITY_TIMELINE_ACTION: QuickAction = {
  label: "Activity Timeline",
  href: "/app/timeline",
  icon: "⏱️",
};

/** Owner Dashboard (`/app`) quick actions. */
export const OWNER_QUICK_ACTIONS: QuickAction[] = [
  { label: "New Estimate", href: "/app/estimates", icon: "📝" },
  { label: "New Job", href: "/app/jobs", icon: "🛠️" },
  { label: "Schedule", href: "/app/schedule", icon: "📅" },
  { label: "Invoices", href: "/app/invoices", icon: "🧾" },
  { label: "Clients", href: "/app/clients", icon: "👥" },
  ACTIVITY_TIMELINE_ACTION,
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];

/**
 * Field My Day (`/app/my-day`) quick actions. Rendered for technicians as well
 * as owners, so it intentionally omits the owner/admin-only Activity Timeline.
 */
export const FIELD_QUICK_ACTIONS: QuickAction[] = [
  { label: "New Estimate", href: "/app/estimates", icon: "📝" },
  { label: "New Job", href: "/app/jobs", icon: "🛠️" },
  { label: "Log Mileage", href: "/app/mileage", icon: "🚗" },
  { label: "Add Expense", href: "/app/expenses/new", icon: "🛒" },
  { label: "Upload Receipt", href: "/app/expenses/new", icon: "🧾" },
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];
