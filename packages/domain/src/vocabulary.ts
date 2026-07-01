export const CANONICAL_BACKEND_TERMS = {
  client: "client",
  property: "property",
  job: "job",
  work_order: "work_order",
  visit: "visit",
  booking_request: "booking_request",
  estimate: "estimate",
  invoice: "invoice",
  payment: "payment",
  membership: "membership",
  change_order: "change_order",
  workflow: "workflow",
  pricing_mode: "pricing_mode",
  fixed_bid: "flat_rate",
  time_and_materials: "hourly_internal",
} as const;

export type CanonicalBackendTerm = keyof typeof CANONICAL_BACKEND_TERMS;

/** Primary owner/staff UI labels. Backend table names stay stable. */
export const PRIMARY_UI_LABELS = {
  job: "Project",
  jobs: "Projects",
  work_order: "Work Order",
  work_orders: "Work Orders",
  visit: "Visit",
  visits: "Visits",
} as const;

export type PrimaryUiLabelKey = keyof typeof PRIMARY_UI_LABELS;

export function primaryUiLabel(key: PrimaryUiLabelKey): string {
  return PRIMARY_UI_LABELS[key];
}

export const UI_DISPLAY_TERMS = {
  booking_request: ["Request", "New Request", "Intake"],
  job: ["Project"],
  work_order: ["Work Order"],
  visit: ["Visit", "Walkthrough"],
  estimate: ["Estimate", "Quote"],
  membership: ["Membership", "Maintenance Plan"],
  workflow: ["Workflow"],
  pricing_mode: ["Fixed Bid", "Time and Materials"],
  fixed_bid: ["Fixed Bid"],
  time_and_materials: ["Time and Materials"],
} as const;

export const DEPRECATED_FRONTEND_TERMS = [
  "lead",
  "pipeline",
  "ticket",
  "subscription",
  "appointment",
  "asset",
  "dispatch",
] as const;

export const REQUIRED_ADAPTER_RULES = [
  "Keep backend tables, routes, and status enums stable unless a migration is explicit.",
  "Allow UI aliases only at the presentation layer.",
  "Map retired terms to canonical terms through one adapter layer.",
  "Update glossary, workflow map, and tests in the same change when vocabulary changes.",
  "Reject parallel concepts unless they are explicit compatibility aliases.",
] as const;