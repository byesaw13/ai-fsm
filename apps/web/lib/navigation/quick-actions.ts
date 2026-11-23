/**
 * The one New button (TASK-236). Every staff surface that starts work — the
 * phone + button, the desktop sidebar New, the Today strip and the command
 * palette — reads these two lists, so the choices never disagree.
 *
 * New is owner/admin only: every target below is guarded to those roles.
 * Vehicle tracking (`/app/timeline`) is a destination, not a start.
 */

import { UI } from "@/lib/vocabulary";

export interface QuickAction {
  label: string;
  /** Internal app path. Components cast this to Next's typed `Route`. */
  href: string;
  icon: string;
  /** Opens the shared QuickBookModal instead of navigating (TASK-119). */
  action?: "quick-book";
  /** Receipt: pin to the open job when there is one. */
  pinToJob?: boolean;
}

/** The three plain choices. The app decides which records to create. */
export const NEW_ACTIONS: QuickAction[] = [
  { label: "Someone called", href: "/app/intake/new", icon: "📞" },
  { label: "Quick job", href: "/app/my-work", icon: "🧰", action: "quick-book" },
  { label: "Receipt, photo or note", href: "/app/capture", icon: "📸" },
];

/** Rarer starts, one tap further under More. */
export const NEW_MORE_ACTIONS: QuickAction[] = [
  { label: "Receipt for a job", href: "/app/expenses/new", icon: "🧾", pinToJob: true },
  { label: "Material run", href: "/app/expenses/new?mode=run", icon: "🛒" },
  { label: "Log mileage", href: "/app/mileage/new", icon: "🚗" },
  { label: `${UI.invoice} without a job`, href: "/app/invoices/new", icon: "💵" },
  { label: `Full ${UI.job.toLowerCase()} form`, href: "/app/jobs/new", icon: "📋" },
  { label: `Full ${UI.estimate.toLowerCase()} form`, href: "/app/estimates/new", icon: "📝" },
];

/** Receipt pinned to the open job, so a Home Depot run does not float unattached. */
export function fieldReceiptHref(jobId: string | null | undefined): string {
  if (!jobId) return "/app/expenses/new";
  return `/app/expenses/new?job=${encodeURIComponent(jobId)}`;
}

export function newActionHref(action: QuickAction, currentJobId?: string | null): string {
  return action.pinToJob ? fieldReceiptHref(currentJobId) : action.href;
}
