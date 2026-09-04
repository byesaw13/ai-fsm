/**
 * Quick Action link sets for the owner Dashboard and the field My Day surface.
 *
 * Extracted from the dashboard components so the destinations are a single,
 * testable source of truth.
 *
 * Vehicle tracking (`/app/timeline`) is owner/admin-only and lives in the Home
 * hub as Tracking — not in these field/dashboard quick-action strips. The
 * route still enforces the owner/admin guard.
 */

export interface QuickAction {
  label: string;
  /** Internal app path. Components cast this to Next's typed `Route`. */
  href: string;
  icon: string;
}

/** Owner Dashboard (`/app`) quick actions. */
export const OWNER_QUICK_ACTIONS: QuickAction[] = [
  { label: "Capture", href: "/app/capture", icon: "🎙️" },
  { label: "New Estimate", href: "/app/estimates", icon: "📝" },
  { label: "Quick Materials", href: "/app/materials/quick", icon: "📦" },
  { label: "New Project", href: "/app/jobs", icon: "🛠️" },
  { label: "Schedule", href: "/app/schedule", icon: "📅" },
  { label: "Invoices", href: "/app/invoices", icon: "🧾" },
  { label: "Clients", href: "/app/clients", icon: "👥" },
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];

/**
 * Field My Day (`/app/my-work`) quick actions. Rendered for technicians as well
 * as owners, so it intentionally omits owner/admin-only vehicle tracking.
 */
export const FIELD_QUICK_ACTIONS: QuickAction[] = [
  { label: "New Estimate", href: "/app/estimates", icon: "📝" },
  { label: "Quick Materials", href: "/app/materials/quick", icon: "📦" },
  { label: "New Project", href: "/app/jobs", icon: "🛠️" },
  { label: "Add Expense", href: "/app/expenses/new", icon: "🛒" },
  { label: "Upload Receipt", href: "/app/expenses/new", icon: "🧾" },
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];
