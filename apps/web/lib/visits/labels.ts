/**
 * Owner-facing visit type labels and helpers.
 * Prefer these over raw visit_type strings in UI.
 */

import {
  EXECUTION_VISIT_TYPES,
  VISIT_TYPE_LABELS,
  type VisitType,
} from "@ai-fsm/domain";

/** Owner labels — Assessment / Work day first-class. */
export const OWNER_VISIT_TYPE_LABELS: Record<VisitType, string> = {
  ...VISIT_TYPE_LABELS,
  site_visit: "Assessment",
  standard: "Work Day",
  punch_list: "Punch List",
  sales_walkthrough: "Sales Walkthrough",
  realtor_baseline: "Realtor Baseline",
  membership_health_check: "Membership Health Check",
};

export function visitTypeLabel(visitType: string | null | undefined): string {
  if (!visitType) return "Visit";
  if (visitType in OWNER_VISIT_TYPE_LABELS) {
    return OWNER_VISIT_TYPE_LABELS[visitType as VisitType];
  }
  return visitType.replace(/_/g, " ");
}

/** Full assessment packet visits (assessment form applies). */
export function isAssessmentVisit(visitType: string | null | undefined): boolean {
  return visitType === "site_visit";
}

/** Pre-sale field visits (assessment or sales walkthrough). */
export function isPreSaleVisit(visitType: string | null | undefined): boolean {
  return visitType === "site_visit" || visitType === "sales_walkthrough";
}

export function isExecutionVisitType(visitType: string | null | undefined): boolean {
  return (EXECUTION_VISIT_TYPES as readonly string[]).includes(visitType ?? "");
}

export type IntakeRoutingPath =
  | "site_visit"
  | "book_work"
  | "remote_estimate"
  | "pending";

export const INTAKE_ROUTING_PATHS = [
  "site_visit",
  "book_work",
  "remote_estimate",
  "pending",
] as const;

export const INTAKE_PATH_LABELS: Record<IntakeRoutingPath, string> = {
  site_visit: "Schedule assessment",
  book_work: "Book work appointment",
  remote_estimate: "Remote estimate only",
  pending: "Not chosen yet",
};

export const INTAKE_PATH_DETAILS: Record<Exclude<IntakeRoutingPath, "pending">, string> = {
  site_visit:
    "Go on site to measure, photo, and capture scope — then estimate. Uses the Assessment form.",
  book_work:
    "Scope is clear enough to show up and work (or run T&M). Schedules a work day — no full assessment required.",
  remote_estimate:
    "No visit yet. Draft and send an estimate from notes, photos, or the request description.",
};
