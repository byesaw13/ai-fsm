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

import { UI } from "@/lib/vocabulary";

export interface QuickAction {
  label: string;
  /** Internal app path. Components cast this to Next's typed `Route`. */
  href: string;
  icon: string;
  /** Opens the shared QuickBookModal instead of navigating (TASK-119). */
  action?: "quick-book";
}

/** Owner Dashboard (`/app`) quick actions. */
export const OWNER_QUICK_ACTIONS: QuickAction[] = [
  { label: "Capture", href: "/app/capture", icon: "🎙️" },
  { label: `New ${UI.estimate}`, href: "/app/estimates", icon: "📝" },
  { label: "Quick Materials", href: "/app/materials/quick", icon: "📦" },
  { label: "New Job", href: "/app/jobs", icon: "🛠️" },
  { label: "Schedule", href: "/app/schedule", icon: "📅" },
  { label: UI.invoices, href: "/app/invoices", icon: "🧾" },
  { label: UI.customers, href: "/app/clients", icon: "👥" },
  { label: "New Request", href: "/app/intake/new", icon: "⚡" },
];

/**
 * Today (`/app/my-work`) capture strip. Three intents: driveway job, receipt
 * on the current house, quote. Everything else is a drawer on the desk.
 */
export const FIELD_QUICK_ACTIONS: QuickAction[] = [
  { label: "Job", href: "/app/my-work", icon: "🧰", action: "quick-book" },
  { label: "Receipt", href: "/app/expenses/new", icon: "🧾" },
  { label: UI.estimate, href: "/app/estimates/new", icon: "📝" },
];

/** Today Receipt tile. Pin to the open job so Home Depot does not float unattached. */
export function fieldReceiptHref(jobId: string | null | undefined): string {
  if (!jobId) return "/app/expenses/new";
  return `/app/expenses/new?job=${encodeURIComponent(jobId)}`;
}

/** Global + sheet (owner/admin). Quick job opens the same modal as My Day / Schedule. */
export const FAB_QUICK_ACTIONS: QuickAction[] = [
  { label: "Capture", href: "/app/capture", icon: "🎙️" },
  { label: "Quick job", href: "/app/my-work", icon: "🧰", action: "quick-book" },
  { label: `Quick ${UI.estimate}`, href: "/app/estimates/quick", icon: "⚡" },
  { label: `New ${UI.invoice}`, href: "/app/invoices/new", icon: "💵" },
  { label: "New Job", href: "/app/jobs/new", icon: "🧰" },
  { label: "New Request", href: "/app/intake/new", icon: "📋" },
  { label: "Material Run", href: "/app/expenses/new?mode=run", icon: "🧾" },
  { label: "Log Mileage", href: "/app/mileage/new", icon: "🚗" },
];
