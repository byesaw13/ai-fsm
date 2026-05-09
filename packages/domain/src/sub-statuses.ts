export const JOB_SUB_STATUSES = [
  "waiting_parts",
  "customer_hold",
  "dispute",
  "quote_revision",
] as const;

export const VISIT_SUB_STATUSES = [
  "no_show",
  "weather_hold",
  "waiting_parts",
  "reschedule_requested",
] as const;

export type JobSubStatus = typeof JOB_SUB_STATUSES[number];
export type VisitSubStatus = typeof VISIT_SUB_STATUSES[number];

export const SUB_STATUS_LABELS: Record<string, string> = {
  waiting_parts: "Waiting Parts",
  customer_hold: "Customer Hold",
  dispute: "Dispute",
  quote_revision: "Quote Revision",
  no_show: "No Show",
  weather_hold: "Weather Hold",
  reschedule_requested: "Reschedule Requested",
};
