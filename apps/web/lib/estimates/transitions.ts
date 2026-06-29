import { estimateTransitions } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";

/**
 * Statuses a user may set via the manual "Transition Status" control.
 *
 * `sent` is deliberately excluded: an estimate must only become `sent` as a
 * side effect of actually delivering it to the client (the "Send to Client"
 * action, which emails the client AND flips the status). Offering a bare
 * "→ Sent" button let users mark an estimate sent without it ever being
 * delivered, and the immutability invariant then froze `sent_at` so it could
 * not be corrected.
 *
 * The underlying domain transition map (estimateTransitions) is unchanged —
 * draft→sent remains valid for the send route to perform internally.
 */
export function manualEstimateTransitions(status: EstimateStatus): EstimateStatus[] {
  return estimateTransitions[status].filter((s) => s !== "sent");
}

/** Statuses that may never be reached through the manual transition endpoint. */
export const NON_MANUAL_ESTIMATE_STATUSES: readonly EstimateStatus[] = ["sent"];
