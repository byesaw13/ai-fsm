/**
 * Pure allow-maps for status-board drag targets.
 * Mirrors domain transition maps; estimates block draft→sent (must use Send).
 */

import {
  estimateTransitions,
  jobTransitions,
  type EstimateStatus,
  type JobStatus,
} from "@ai-fsm/domain";

export function canJobBoardDrop(from: string, to: string): boolean {
  const allowed = jobTransitions[from as JobStatus];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

/**
 * Board drag for estimates: only transitions the generic transition endpoint allows.
 * draft → sent is intentionally forbidden (must use Send to Client).
 */
export function canEstimateBoardDrop(from: string, to: string): boolean {
  if (to === "sent") return false;
  const allowed = estimateTransitions[from as EstimateStatus];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}

/** Soft workflow for work-order board (API accepts any UI status via PATCH). */
const WORK_ORDER_BOARD_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["ready", "scheduled", "cancelled"],
  ready: ["scheduled", "dispatched", "draft", "cancelled"],
  scheduled: ["dispatched", "waiting", "ready", "cancelled"],
  dispatched: ["waiting", "completed", "scheduled", "cancelled"],
  waiting: ["dispatched", "completed", "scheduled", "cancelled"],
  completed: [],
  cancelled: ["draft"],
};

export function canWorkOrderBoardDrop(from: string, to: string): boolean {
  const allowed = WORK_ORDER_BOARD_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}
